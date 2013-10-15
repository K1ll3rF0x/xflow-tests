(function () {
    var webGL = XML3D.webgl;

    // Defining post processing pipeline

    (function () {

        var PostProcessingPipeline = function (context) {
            webGL.RenderPipeline.call(this, context);
            this.createRenderPasses();
        };

        XML3D.createClass(PostProcessingPipeline, webGL.RenderPipeline);

        XML3D.extend(PostProcessingPipeline.prototype, {
            init: function () {
                var context = this.context;

                //Also available: webgl.GLScaledRenderTarget
                var backBuffer = new webGL.GLRenderTarget(context, {
                    width: context.canvasTarget.width,
                    height: context.canvasTarget.height,
                    colorFormat: context.gl.RGBA,
                    depthFormat: context.gl.DEPTH_COMPONENT16,
                    stencilFormat: null,
                    depthAsRenderbuffer: true
                });

                //Register this target under the name "backBufferOne" so render passes may use it
                this.addRenderTarget("backBufferOne", backBuffer);

                //The screen is always available under context.canvastarget
                this.addRenderTarget("screen", context.canvastarget);

                //Remember to initialize each render pass
                this.renderPasses.forEach(function (pass) {
                    if (pass.init) {
                        pass.init(context);
                    }
                });
            },

            createRenderPasses: function () {
                //This is where the render process is defined as a series of render passes. They will be executed in the
                //order that they are added. XML3D.webgl.ForwardRenderPass may be used to draw all visible objects to the given target

                var forwardPass1 = new XML3D.webgl.ForwardRenderPass(this, "backBufferOne"),
                    webCLPass = new XML3D.webgl.WebCLPass(this, "backBufferOne", {inputs: { inputTexture: "backBufferOne" }}),
                    BlitPass = new XML3D.webgl.BlitPass(this, "screen", {inputs: { inputTexture: "backBufferOne" }});

                this.addRenderPass(forwardPass1);
                this.addRenderPass(webCLPass);
                this.addRenderPass(BlitPass);
            }
        });

        webGL.PostProcessingPipeline = PostProcessingPipeline;

    }());


    (function () {

        var WebCLPass = function (pipeline, output, opt) {
            webGL.BaseRenderPass.call(this, pipeline, output, opt);
        };

        XML3D.createClass(WebCLPass, webGL.BaseRenderPass, {
            init: function (context) {
                this.debugCanvas = document.getElementById("debug");
                this.debugCtx = this.debugCanvas.getContext("2d");
                this.textureBuffer = new Uint8Array(context.canvasTarget.width * context.canvasTarget.height * 4);
                this.gl = this.pipeline.context.gl;
            },

            render: function (scene) {
                var gl = this.gl, sourceTex, pixelData, imageData;

                //Request the framebuffer from the render pipeline, using its name (in this case 'backBufferOne')
                sourceTex = this.pipeline.getRenderTarget(this.inputs.inputTexture);

                sourceTex.bind();
                gl.readPixels(0, 0, sourceTex.height, sourceTex.width, gl.RGBA, gl.UNSIGNED_BYTE, this.textureBuffer);
                sourceTex.unbind();

                // Debug code ---
                pixelData = new Uint8ClampedArray(this.textureBuffer);
                imageData = this.debugCtx.createImageData(sourceTex.height, sourceTex.width);
                imageData.data.set(pixelData);
                this.debugCtx.putImageData(imageData, 0, 0);

                // --- Debug end

                // TODO: Do something cool with WebCL here by modifying the texturebuffer in WebCL context.

                // We are giving input directly to output for now...
                this.output = sourceTex;

            }
        });

        webGL.WebCLPass = WebCLPass;

    }());


    (function () {

        var BlitPass = function (pipeline, output, opt) {
            webGL.BaseRenderPass.call(this, pipeline, output, opt);
            this.screenQuad = {};
        };

        XML3D.createClass(BlitPass, webGL.BaseRenderPass, {
            init: function (context) {
                var shader = context.programFactory.getProgramByName("drawTexture");
                this.pipeline.addShader("blitShader", shader);
                this.screenQuad = new webGL.FullscreenQuad(context);
                this.canvasSize = new Float32Array([context.canvasTarget.width, context.canvasTarget.height]);
                this.gl = this.pipeline.context.gl;
            },

            render: function (scene) {
                var gl = this.gl,
                    target = this.pipeline.getRenderTarget(this.output),
                    program = this.pipeline.getShader("blitShader"),
                    sourceTex = this.pipeline.getRenderTarget(this.inputs.inputTexture);

                target.bind();
                gl.clear(gl.DEPTH_BUFFER_BIT || gl.COLOR_BUFFER_BIT);

                program.bind();

                //Request the framebuffer from the render pipeline, using its name (in this case 'backBufferOne')
                program.setUniformVariables({ inputTexture: sourceTex.colorTarget, canvasSize: this.canvasSize});

                this.screenQuad.draw(program);

                program.unbind();
                target.unbind();
            }
        });

        webGL.BlitPass = BlitPass;

    }());

    XML3D.shaders.register("drawTexture", {

        vertex: [
            "attribute vec3 position;",

            "void main(void) {",
            "   gl_Position = vec4(position, 0.0);",
            "}"
        ].join("\n"),

        fragment: [
            "uniform sampler2D inputTexture;",
            "uniform vec2 canvasSize;",

            "void main(void) {",
            "    vec2 texCoord = (gl_FragCoord.xy / canvasSize.xy);",
            "    gl_FragColor = texture2D(inputTexture, texCoord);",
            "}"
        ].join("\n"),

        uniforms: {
            canvasSize: [512, 512]
        },

        samplers: {
            inputTexture: null
        }
    });


    // --- Initialisation ---

    var PPPipeline, forwardPipeline, currentPipeline, renderI, initPPPipeLine, swapPipelines;

    initPPPipeLine = function () {
        var xml3ds = document.getElementsByTagName("xml3d"), ctx;

        if (xml3ds[0]) {
            //Render pipeline is gettable only from XMl3D element only after xml3d has been properly initialised
            renderI = xml3ds[0].getRenderInterface();

            //The normal forward rendering pipeline is always available initially
            //It's also available as a render pass under the constructor XML3D.webgl.ForwardRenderPass(context),
            forwardPipeline = renderI.getRenderPipeline();

            PPPipeline = new webGL.PostProcessingPipeline(renderI.context);
            PPPipeline.init();
            renderI.setRenderPipeline(PPPipeline);
            currentPipeline = "postProcess";
        }
    };

    swapPipelines = function (evt) {
        if (evt.keyCode === 112) /* P */ {
            if (currentPipeline === "postProcess") {
                renderI.setRenderPipeline(forwardPipeline);
                currentPipeline = "forward";
            } else {
                renderI.setRenderPipeline(PPPipeline);
                currentPipeline = "postProcess";
            }
        }
    };

    window.addEventListener("keypress", swapPipelines);
    window.addEventListener("load", initPPPipeLine);


}());