(function () {
    var webgl = XML3D.webgl,
        webcl = XML3D.webcl;


    webcl.kernels.register("clDesaturate",
        ["__kernel void clDesaturate(__global const uchar4* src, __global uchar4* dst, uint width, uint height)",
            "{",
            "int x = get_global_id(0);",
            "int y = get_global_id(1);",
            "if (x >= width || y >= height) return;",
            "int i = y * width + x;  uchar4 color = src[i];",
            "uchar lum = (uchar)(0.30f * color.x + 0.59f * color.y + 0.11f * color.z);",
            "dst[i] = (uchar4)(lum, lum, lum, 255);",
            "}"].join("\n"));


    // Defining post processing pipeline

    (function () {

        var PostProcessingPipeline = function (context) {
            webgl.RenderPipeline.call(this, context);
            this.createRenderPasses();
        };

        XML3D.createClass(PostProcessingPipeline, webgl.RenderPipeline);

        XML3D.extend(PostProcessingPipeline.prototype, {
            init: function () {
                var context = this.context;

                //Also available: webgl.GLScaledRenderTarget
                var backBuffer = new webgl.GLRenderTarget(context, {
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

                var forwardPass1 = new webgl.ForwardRenderPass(this, "backBufferOne"),
                    webCLPass = new webgl.WebCLPass(this, "backBufferOne", {inputs: { inputTexture: "backBufferOne" }}),
                    BlitPass = new webgl.BlitPass(this, "screen", {inputs: { inputTexture: "backBufferOne" }});

                this.addRenderPass(forwardPass1);
                this.addRenderPass(webCLPass);
                this.addRenderPass(BlitPass);
            }
        });

        webgl.PostProcessingPipeline = PostProcessingPipeline;

    }());


    (function () {

        var WebCLPass = function (pipeline, output, opt) {
            webgl.BaseRenderPass.call(this, pipeline, output, opt);
        };

        XML3D.createClass(WebCLPass, webgl.BaseRenderPass, {
            init: function (context) {
                this.debugCanvas = document.getElementById("debug");
                this.debugCtx = this.debugCanvas.getContext("2d");
                this.bufSize = (context.canvasTarget.width * context.canvasTarget.height * 4);
                this.inputTexBuffer = new Uint8Array(this.bufSize);
                this.screenQuad = new webgl.FullscreenQuad(context);
                this.gl = this.pipeline.context.gl;

                //WebCL
                this.clCtx = webcl.ctx;
                this.grayScaleKernel = webcl.kernels.getKernel("clDesaturate");
                this.clBufIn = this.clCtx.createBuffer(WebCL.CL_MEM_READ_ONLY, this.bufSize); //Buffer in WebCL Ctx
                this.clBufOut = this.clCtx.createBuffer(WebCL.CL_MEM_WRITE_ONLY, this.bufSize); //Buffer in WebCL Ctx
                this.outputTexBuffer = new Uint8Array(this.bufSize);
            },

            render: function (scene) {
                var gl = this.gl, clCtx = this.clCtx, grayScaleKernel = this.grayScaleKernel,
                    sourceTex, pixelData, imageData, localWS, globalWS;

                //Request the framebuffer from the render pipeline, using its name (in this case 'backBufferOne')
                sourceTex = this.pipeline.getRenderTarget(this.inputs.inputTexture);

                sourceTex.bind();
                gl.readPixels(0, 0, sourceTex.height, sourceTex.width, gl.RGBA, gl.UNSIGNED_BYTE, this.inputTexBuffer);
                sourceTex.unbind();

                grayScaleKernel.setKernelArg(0, this.clBufIn);
                grayScaleKernel.setKernelArg(1, this.clBufOut);
                grayScaleKernel.setKernelArg(2, sourceTex.width, WebCL.types.UINT);
                grayScaleKernel.setKernelArg(3, sourceTex.height, WebCL.types.UINT);

                // Write the buffer to OpenCL device memory
                webcl.cmdQueue.enqueueWriteBuffer(this.clBufIn, false, 0, this.bufSize, this.inputTexBuffer, []);

                // Init ND-range
                localWS = [16, 4];
                globalWS = [Math.ceil(sourceTex.height / localWS[0]) * localWS[0],
                    Math.ceil(sourceTex.width / localWS[1]) * localWS[1]];

                // Execute (enqueue) kernel
                webcl.cmdQueue.enqueueNDRangeKernel(grayScaleKernel, globalWS.length, [], globalWS, localWS, []);

                // Read the result buffer from OpenCL device
                webcl.cmdQueue.enqueueReadBuffer(this.clBufOut, false, 0, this.bufSize, this.outputTexBuffer, []);

                webcl.cmdQueue.finish(); //Finish all the operations


                // Debug code start ---
                pixelData = new Uint8ClampedArray(this.outputTexBuffer);
                imageData = this.debugCtx.createImageData(sourceTex.height, sourceTex.width);
                imageData.data.set(pixelData);
                this.debugCtx.putImageData(imageData, 0, 0);
                // --- Debug end


            }
        });

        webgl.WebCLPass = WebCLPass;

    }());


    (function () {

        var BlitPass = function (pipeline, output, opt) {
            webgl.BaseRenderPass.call(this, pipeline, output, opt);
            this.screenQuad = {};
        };

        XML3D.createClass(BlitPass, webgl.BaseRenderPass, {
            init: function (context) {
                var shader = context.programFactory.getProgramByName("drawTexture");
                this.pipeline.addShader("blitShader", shader);
                this.screenQuad = new webgl.FullscreenQuad(context);
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

        webgl.BlitPass = BlitPass;

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

            PPPipeline = new webgl.PostProcessingPipeline(renderI.context);
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