(function () {
    var depthPipeline, forwardPipeline, currentPipeline, renderI, injectDepthPipeline, swapPipelines;

    injectDepthPipeline = function () {
        var xml3ds = document.getElementsByTagName("xml3d");

        if (xml3ds[0]) {
            renderI = xml3ds[0].getRenderInterface();
            //The normal forward rendering pipeline is always available initially
            //It's also available as a render pass under the constructor XML3D.webgl.ForwardRenderPass(context),
            forwardPipeline = renderI.getRenderPipeline();

            depthPipeline = new XML3D.webgl.DepthRenderPipeline(renderI.context);
            depthPipeline.init();
            renderI.setRenderPipeline(depthPipeline);
            currentPipeline = "depth";
        }
    };

    swapPipelines = function (evt) {
        if (evt.keyCode === 112) /* P */ {
            if (currentPipeline === "depth") {
                renderI.setRenderPipeline(forwardPipeline);
                currentPipeline = "forward";
            } else {
                renderI.setRenderPipeline(depthPipeline);
                currentPipeline = "depth";
            }
        }
    };

    window.addEventListener("keypress", swapPipelines);
    window.addEventListener("load", injectDepthPipeline);

    (function (webgl) {

        var DepthRenderPipeline = function (context) {
            webgl.RenderPipeline.call(this, context);
            this.createRenderPasses();
        };

        XML3D.createClass(DepthRenderPipeline, webgl.RenderPipeline);

        XML3D.extend(DepthRenderPipeline.prototype, {
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
                var depthPass = new XML3D.webgl.DepthPass(this, "backBufferOne");
                this.addRenderPass(depthPass);

                //Blitpass uses backBufferOne as input and simply draws it to the screen
                var blitPass = new XML3D.webgl.BlitPass(this, "screen", {inputs: { inputTexture: "backBufferOne" }});
                this.addRenderPass(blitPass);
            }
        });

        webgl.DepthRenderPipeline = DepthRenderPipeline;

    })(XML3D.webgl);


    (function (webgl) {

        var DepthPass = function (pipeline, output, opt) {
            webgl.BaseRenderPass.call(this, pipeline, output, opt);
        };

        XML3D.createClass(DepthPass, webgl.BaseRenderPass, {
            init: function (context) {
                var shader = context.programFactory.getProgramByName("depthAsColor");
                this.pipeline.addShader("depthShader", shader);
            },

            render: (function () {
                var c_projMat_tmp = XML3D.math.mat4.create();
                var tmpModelViewProjection = XML3D.math.mat4.create();

                return function (scene) {
                    var gl = this.pipeline.context.gl;
                    var objects = scene.ready;
                    var target = this.pipeline.getRenderTarget(this.output);
                    target.bind();

                    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
                    gl.viewport(0, 0, target.getWidth(), target.getHeight());
                    gl.enable(gl.DEPTH_TEST);

                    scene.getActiveView().getProjectionMatrix(c_projMat_tmp, target.width / target.height);
                    scene.updateReadyObjectsFromActiveView(target.getWidth() / target.getHeight());

                    var parameters = {};
                    var program = this.pipeline.getShader("depthShader");
                    program.bind();

                    for (var i = scene.firstOpaqueIndex, n = objects.length; i < n; i++) {
                        var obj = objects[i];
                        if (!obj.isVisible())
                            continue;

                        var mesh = obj.mesh;
                        XML3D.debug.assert(mesh, "We need a mesh at this point.");

                        obj.getModelViewProjectionMatrix(tmpModelViewProjection);
                        parameters["modelViewProjectionMatrix"] = tmpModelViewProjection;
                        program.setUniformVariables(parameters);
                        mesh.draw(program);
                    }
                    program.unbind();
                    target.unbind();
                }
            })()

        });

        webgl.DepthPass = DepthPass;

    }(XML3D.webgl));

    (function (webgl) {

        var BlitPass = function (pipeline, output, opt) {
            webgl.BaseRenderPass.call(this, pipeline, output, opt);
            this.screenQuad = {};
        };

        XML3D.createClass(BlitPass, webgl.BaseRenderPass, {
            init: function (context) {
                var shader = context.programFactory.getProgramByName("colorFromDepth");
                this.pipeline.addShader("blitShader", shader);
                this.screenQuad = new XML3D.webgl.FullscreenQuad(context);
                this.canvasSize = new Float32Array([context.canvasTarget.width, context.canvasTarget.height]);
            },

            render: function (scene) {
                var gl = this.pipeline.context.gl;
                var target = this.pipeline.getRenderTarget(this.output);
                target.bind();
                gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

                var program = this.pipeline.getShader("blitShader");
                program.bind();
                //Request the framebuffer from the render pipeline, using its name (in this case 'backBufferOne')
                var sourceTex = this.pipeline.getRenderTarget(this.inputs.inputTexture);
                program.setUniformVariables({ inputTexture: sourceTex.colorTarget, canvasSize: this.canvasSize});

                this.screenQuad.draw(program);

                program.unbind();
                target.unbind();
            }
        });

        webgl.BlitPass = BlitPass;

    }(XML3D.webgl));

    XML3D.shaders.register("depthAsColor", {

        vertex: [
            "attribute vec3 position;",
            "uniform mat4 modelViewProjectionMatrix;",

            "void main(void) {",
            "   gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);",
            "}"
        ].join("\n"),

        fragment: [
            "const vec4 bitShift = vec4(16777216.0, 65536.0, 256.0, 1.0);",
            "const vec4 bitMask = vec4(0.0, 1.0/256.0, 1.0/256.0, 1.0/256.0);",

            "void main(void) {",
            "    float depth = gl_FragCoord.z;",
            "    vec4 encoded = fract(depth * bitShift);",
            "    encoded = encoded - encoded.xxyz * bitMask;",
            "    gl_FragColor = encoded;",
            "}"
        ].join("\n"),

        uniforms: {
        }
    });

    XML3D.shaders.register("colorFromDepth", {

        vertex: [
            "attribute vec3 position;",

            "void main(void) {",
            "   gl_Position = vec4(position, 0.0);",
            "}"
        ].join("\n"),

        fragment: [
            "uniform sampler2D inputTexture;",
            "uniform vec2 canvasSize;",

            "const vec4 bitShift = vec4(1.0 / (256.0 * 256.0 * 256.0), 1.0 / (256.0 * 256.0), 1.0 / 256.0, 1.0);",

            "void main(void) {",
            "    vec2 texcoord = (gl_FragCoord.xy / canvasSize.xy);",
            "    float depth = dot(texture2D(inputTexture, texcoord), bitShift);",
            "    gl_FragColor = vec4(depth, depth, depth, 1.0);",
            "}"
        ].join("\n"),

        uniforms: {
            canvasSize: [512, 512]
        },

        samplers: {
            inputTexture: null
        }
    });
}());