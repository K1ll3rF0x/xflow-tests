(function () {


    XML3D.debug.loglevel = 4;
    var PostProcessingPipeline, forwardPipeline, currentPipeline, renderI, injectDepthPipeline, swapPipelines, blitPass;
    var buffers = {bufIn: null, bufOut: null};
    var webgl = XML3D.webgl;
    injectDepthPipeline = function () {
        var xml3ds = document.getElementsByTagName("xml3d");

        if (xml3ds[0]) {
            renderI = xml3ds[0].getRenderInterface();

            //The normal forward rendering pipeline is always available initially
            //It's also available as a render pass under the constructor XML3D.webgl.ForwardRenderPass(context),
            forwardPipeline = renderI.getRenderPipeline();

        //    renderI.setRenderPipeline(PostProcessingPipeline);
        //    currentPipeline = "depth";
            blitPass = new webgl.BlitPass(forwardPipeline);
            blitPass.init(forwardPipeline.context);

        }
    };

    window.addEventListener("load", injectDepthPipeline);

 (function () {

        var BlitPass = function (pipeline, output, opt) {
            webgl.BaseRenderPass.call(this, pipeline, output, opt);
        };

        XML3D.createClass(BlitPass, webgl.BaseRenderPass, {
            init: function (context) {

                var shader = context.programFactory.getProgramByName("blur");
                forwardPipeline.addShader("blurShader", shader);

                shader = context.programFactory.getProgramByName("grayscale");
                forwardPipeline.addShader("grayscaleShader", shader);


                shader = context.programFactory.getProgramByName("flipTexture");
                forwardPipeline.addShader("fliptextureShader", shader);

                // WebGL
                this.gl = this.pipeline.context.gl;
                this.debugCanvas = document.getElementById("debug");
                this.debugCtx = this.debugCanvas.getContext("2d");
                this.canvasWidth = context.canvasTarget.width;
                this.canvasHeight = context.canvasTarget.height;
                this.canvasSize = new Float32Array([this.canvasWidth, this.canvasHeight]);
                this.screenQuad = new webgl.FullscreenQuad(context);
                this.resultTexture = this.gl.createTexture();
                this.frameBuffer = this.gl.createFramebuffer();
                this.textureBuffer = new Uint8Array(context.canvasTarget.width * context.canvasTarget.height * 4);

            },

            renderOnce: function (image,shader) {

                var gl = this.gl,
                    width = this.canvasWidth,
                    height = this.canvasHeight,
                    program = forwardPipeline.getShader(shader),
                    program2 = forwardPipeline.getShader("fliptextureShader"),
                    screenQuad = this.screenQuad,
                    textureBuffer = this.textureBuffer,
                    texture = this.resultTexture,
                    framebuffer = this.frameBuffer,
                    debugCtx = this.debugCtx,
                    textureBuffer = this.textureBuffer,
                    testBuffer = new Uint8Array(image.width * image.height * 4),
                    textureTest = new Float32Array([image.width,image.height]),

                    //Variables for debugging
                    pixelData, imageData;


                    // Render scene to fbo
                    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

                    program.bind();

                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, texture);
            //        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
                    // Creating texture from pixel data
                    var buffer = new Uint8Array(image.data);
                    //gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData);

                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

                    program.setUniformVariables({ inputTexture: texture, canvasSize: textureTest});

                    screenQuad.draw(program);

                    gl.bindTexture(gl.TEXTURE_2D, null);

              //      gl.readPixels(0, 0, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, testBuffer);

                /*   // Debug code start ---
                    pixelData = new Uint8ClampedArray(testBuffer);
                    imageData = debugCtx.createImageData(image.width, image.height);
                    imageData.data.set(pixelData);
                    debugCtx.putImageData(imageData, 0, 0);
                    // --- Debug end*/

                    program.unbind();
                    /*--------------------------Second Shader(flip)------------------------------*/
                    program2.bind();

                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, texture);

                    program2.setUniformVariables({ inputTexture: texture});

                    screenQuad.draw(program2);

               //     gl.copyTexImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 0, 0, image.width, image.height, 0);
              //      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);

                    gl.bindTexture(gl.TEXTURE_2D, null);

                    gl.readPixels(0, 0, image.width, image.height, gl.RGBA, gl.UNSIGNED_BYTE, testBuffer);

                   // Debug code start ---
                    pixelData = new Uint8ClampedArray(testBuffer);
                    imageData = debugCtx.createImageData(image.width, image.height);
                    imageData.data.set(pixelData);
                    debugCtx.putImageData(imageData, 0, 0);
                    // --- Debug end

                     program2.unbind();

                    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

                return testBuffer;
            }
        });

        webgl.BlitPass = BlitPass;

    }());

           /**
     * GLSL accelerated Grayscale operator
     */


    Xflow.registerOperator("xflow.glslGrayscale", {
        outputs: [ {type: 'texture', name : 'result', sizeof : 'image'} ],
        params:  [ {type: 'texture', source : 'image' } ],
        evaluate: function(result, image) {
        console.log(blitPass);
        result.data.set(blitPass.renderOnce(image,"grayscaleShader"));

        return true;
        }
    });

    /**
     * GLSL accelerated Invert operator
     */
    Xflow.registerOperator("xflow.glslBlur", {
        outputs: [ {type: 'texture', name : 'result', sizeof : 'image'} ],
        params:  [ {type: 'texture', source : 'image'} ],
        evaluate: function(result, image) {

        result.data.set(blitPass.renderOnce(image,"blurShader"));

        }
    });

    XML3D.shaders.register("flipTexture", {

        vertex: [
            "attribute vec3 position;",
            "attribute vec2 aTextureCoord;",

            "varying vec2 vTextureCoord;",

            "void main(void) {",
            " gl_Position = vec4(position, 1.0);",
            " vTextureCoord = vec2(aTextureCoord.s, 1.0 - aTextureCoord.t);",
            "}"
        ].join("\n"),

        fragment: [
            "uniform sampler2D inputTexture;",
            "varying vec2 vTextureCoord;",

            "void main(void) {",
            " gl_FragColor = texture2D(inputTexture, vTextureCoord) * 1.0;",
            "}"
        ].join("\n"),

        uniforms: {
            canvasSize: [512, 512]
        },

        samplers: {
            inputTexture: null
        }
    });

    XML3D.shaders.register("blur", {

    vertex: [
        "attribute vec3 position;",

        "void main(void) {",
        "   gl_Position = vec4(position, 0.0);",
        "}"
    ].join("\n"),

    fragment: [
	"uniform sampler2D inputTexture;",
	"uniform vec2 canvasSize;",
       "    vec2 texcoord = (gl_FragCoord.xy / canvasSize.xy);",

	"const float blurSize = 1.0/512.0;",
	"void main(void)",
	"{",

	"vec4 sum = vec4(0.0);",

	"sum += texture2D(inputTexture, vec2(texcoord.x, texcoord.y - 4.0*blurSize)) * 0.05;",
	"sum += texture2D(inputTexture, vec2(texcoord.x, texcoord.y - 3.0*blurSize)) * 0.09;",
	"sum += texture2D(inputTexture, vec2(texcoord.x, texcoord.y - 2.0*blurSize)) * 0.12;",
	"sum += texture2D(inputTexture, vec2(texcoord.x, texcoord.y - blurSize)) * 0.15;",
	"sum += texture2D(inputTexture, vec2(texcoord.x, texcoord.y)) * 0.16;",
	"sum += texture2D(inputTexture, vec2(texcoord.x, texcoord.y + blurSize)) * 0.15;",
	"sum += texture2D(inputTexture, vec2(texcoord.x, texcoord.y + 2.0*blurSize)) * 0.12;",
	"sum += texture2D(inputTexture, vec2(texcoord.x, texcoord.y + 3.0*blurSize)) * 0.09;",
	"sum += texture2D(inputTexture, vec2(texcoord.x, texcoord.y + 4.0*blurSize)) * 0.05;",

   	"gl_FragColor = sum;",
	"}"
    ].join("\n"),

    uniforms: {
	canvasSize : [512, 512]
    },

    samplers: {
        inputTexture : null
    }
});

    XML3D.shaders.register("grayscale", {

    vertex: [
        "attribute vec3 position;",

        "void main(void) {",
        "   gl_Position = vec4(position, 0.0);",
        "}"
    ].join("\n"),

    fragment: [
    "precision highp float;",
	"uniform sampler2D inputTexture;",
	"uniform vec2 canvasSize;",
    "    vec2 texcoord = (gl_FragCoord.xy / canvasSize.xy);",

	"void main(void)",
	"{",
    "vec4 frameColor = texture2D(inputTexture, texcoord);",
    "float luminance = frameColor.r * 0.3 + frameColor.g * 0.59 + frameColor.b * 0.11;",
    "gl_FragColor = vec4(luminance, luminance, luminance, frameColor.a);",

	"}"
    ].join("\n"),

    uniforms: {
	textureCoord : [512, 512]
    },

    samplers: {
        inputTexture : null
    }
});

}());
