(function () {
    var canvas,
        gl,
        canvasImgCtx,

        squareVerticesBuffer,
        squareVerticesTextureBuffer,
        cubeVerticesIndexBuffer,
        cubeRotation = 0.0,
        lastCubeUpdateTime = 0,

        squareImage,
        squareTexture,

        mvMatrix,
        shaderProgram,
        vertexPositionAttribute,
        textureCoordAttribute,
        perspectiveMatrix,

        framebuffer,
        renderbuffer,
        texture;

    function logError(e) {
        document.getElementById("output").innerHTML += "<h3>ERROR:</h3><pre style=\"color:red;\">" + e.message + "</pre>";
    }

    //
    // initWebGL
    //
    // Initialize WebGL, returning the GL context or null if
    // WebGL isn't available or could not be initialized.
    //
    function initWebGL(canvas) {
        gl = null;
        // canvasImgCtx = null;

        try {
            gl = canvas.getContext("experimental-webgl");
        }
        catch (e) {
        }

        // If we don't have a GL context, give up now

        if (!gl) {
            alert("Unable to initialize WebGL. Your browser may not support it.");
        }
    }

    //
    // initBuffers
    //
    // Initialize the buffers we'll need. For this demo, we just have
    // one object -- a simple two-dimensional cube.
    //
    function initBuffers() {

        // Create a buffer for the square's vertices.

        squareVerticesBuffer = gl.createBuffer();

        // Select the squareVerticesBuffer as the one to apply vertex
        // operations to from here out.

        gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesBuffer);

        // Now create an array of vertices for the square.

        var vertices = [
            // Square
            -1.0, 1.0, 0.0,  // 0, Top Left
            -1.0, -1.0, 0.0,  // 1, Bottom Left
            1.0, -1.0, 0.0,  // 2, Bottom Right
            1.0, 1.0, 0.0,  // 3, Top Right
        ];

        // Now pass the list of vertices into WebGL to build the shape. We
        // do this by creating a Float32Array from the JavaScript array,
        // then use it to fill the current vertex buffer.

        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        var textureCoordinates = [
            // Front
            0.0, 0.0,
            0.0, 1.0,
            1.0, 1.0,
            1.0, 0.0,
        ];

        squareVerticesTextureBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesTextureBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates), gl.STATIC_DRAW);
    }

    //
    //Creating customized framebuffer obj
    //
    function initFbo(image, d) {

        var width = 256;
        var height = 256;


        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
            gl.UNSIGNED_BYTE, image);

        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.bindTexture(gl.TEXTURE_2D, null);

        //2. Init Render Buffer
        renderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);

        //3. Init Frame Buffer
        framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        // Attach the texture to the framebuffer
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);

        //4. Clean up
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindRenderbuffer(gl.RENDERBUFFER, null);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        pixelsData = 0;
        return pixelsData;
    }





    function bind() {

        // Use the Post Process shader
        gl.useProgram(shaderProgram);

        // Bind the square geometry

        gl.enableVertexAttribArray(vertexPositionAttribute);
        gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesBuffer);
        gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);

        // Set the texture coordinates attribute for the vertices.

        gl.enableVertexAttribArray(textureCoordAttribute);
        gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesTextureBuffer);
        gl.vertexAttribPointer(textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);

        // Bind the texture from the framebuffer

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(gl.getUniformLocation(shaderProgram, "uSampler"), 0);

    }

    function postdraw() {
        // Draw the square
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    }

    //
    // initShaders
    //
    // Initialize the shaders, so WebGL knows how to light our scene.
    //
    function initShaders() {
        var fragmentShader = getShader(gl, "shader-fs");
        // var fragmentShaderInvert = getShader(gl, "shader-fsinv");
        var vertexShader = getShader(gl, "shader-vs");

        // Create the shader program

        shaderProgram = gl.createProgram();
        gl.attachShader(shaderProgram, vertexShader);
        gl.attachShader(shaderProgram, fragmentShader);
        // gl.attachShader(shaderProgram, fragmentShaderInvert);
        gl.linkProgram(shaderProgram);

        // If creating the shader program failed, alert

        if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
            alert("Unable to initialize the shader program.");
        }

        gl.useProgram(shaderProgram);

        vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
        gl.enableVertexAttribArray(vertexPositionAttribute);

        textureCoordAttribute = gl.getAttribLocation(shaderProgram, "aTextureCoord");
        gl.enableVertexAttribArray(textureCoordAttribute);
    }

    //
    // getShader
    //
    // Loads a shader program by scouring the current document,
    // looking for a script with the specified ID.
    //
    function getShader(gl, id) {
        var shaderScript = document.getElementById(id);

        // Didn't find an element with the specified ID; abort.

        if (!shaderScript) {
            return null;
        }

        // Walk through the source element's children, building the
        // shader source string.

        var theSource = "";
        var currentChild = shaderScript.firstChild;

        while (currentChild) {
            if (currentChild.nodeType == 3) {
                theSource += currentChild.textContent;
            }

            currentChild = currentChild.nextSibling;
        }

        // Now figure out what type of shader script we have,
        // based on its MIME type.

        var shader;

        if (shaderScript.type == "x-shader/x-fragment") {
            shader = gl.createShader(gl.FRAGMENT_SHADER);
        } else if (shaderScript.type == "x-shader/x-vertex") {
            shader = gl.createShader(gl.VERTEX_SHADER);
        } else {
            return null;  // Unknown shader type
        }

        // Send the source to the shader object

        gl.shaderSource(shader, theSource);

        // Compile the shader program

        gl.compileShader(shader);

        // See if it compiled successfully

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            alert("An error occurred compiling the shaders: " + gl.getShaderInfoLog(shader));
            return null;
        }

        return shader;
    }

    //
    // Matrix utility functions
    //

    function loadIdentity() {
        mvMatrix = Matrix.I(4);
    }

    function multMatrix(m) {
        mvMatrix = mvMatrix.x(m);
    }

    function mvTranslate(v) {
        multMatrix(Matrix.Translation($V([v[0], v[1], v[2]])).ensure4x4());
    }

    function setMatrixUniforms() {
        var pUniform = gl.getUniformLocation(shaderProgram, "uPMatrix");
        gl.uniformMatrix4fv(pUniform, false, new Float32Array(perspectiveMatrix.flatten()));

        var mvUniform = gl.getUniformLocation(shaderProgram, "uMVMatrix");
        gl.uniformMatrix4fv(mvUniform, false, new Float32Array(mvMatrix.flatten()));
    }


    function draw() {

        // Clear the canvas before we start drawing on it.

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Establish the perspective with which we want to view the
        // scene. Our field of view is 45 degrees, with a width/height
        // ratio of 640:480, and we only want to see objects between 0.1 units
        // and 100 units away from the camera.

        perspectiveMatrix = makePerspective(45, 640.0 / 480.0, 0.1, 100.0);

        // Set the drawing position to the "identity" point, which is
        // the center of the scene.

        loadIdentity();

        // Now move the drawing position a bit to where we want to start
        // drawing the cube.

        mvTranslate([-0.0, 0.0, -6.0]);

        // Draw the cube by binding the array buffer to the cube's vertices
        // array, setting attributes, and pushing it to GL.

        gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesBuffer);
        gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);

        // Set the texture coordinates attribute for the vertices.

        gl.bindBuffer(gl.ARRAY_BUFFER, squareVerticesTextureBuffer);
        gl.vertexAttribPointer(textureCoordAttribute, 2, gl.FLOAT, false, 0, 0);

        // Specify the texture to map onto the faces.

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);

        gl.uniform1i(gl.getUniformLocation(shaderProgram, "uSampler"), 0);

        // Draw the square.

        setMatrixUniforms();

        // gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

    }

    //
    // drawScene
    //
    // Draw the scene.
    //
    function drawScene(d) {

        // Render scene to FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

        draw();

        // Set up the post-process effect for rendering
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        bind();

        postdraw();

        // Reading pixels from framebuffer
        var pixels = new Uint8Array(256 * 256 * 4);
        gl.readPixels(0, 0, 256, 256, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        var pixelsData = new Uint8ClampedArray(pixels);

        var canvasImg = document.getElementById("canvasImg");
        var canvasImgCtx = canvasImg.getContext("2d");

        var imageData = canvasImgCtx.createImageData(256, 256);
        imageData.data.set(pixelsData);
        canvasImgCtx.putImageData(imageData, 0, 0);
        //setting data to xflow operator result trough typed array interface
        d.set(pixelsData);


        // return pixelsData;
    }


    //
    // start
    //
    // Called when the canvas is created to get the ball rolling.
    //
    function start(image, d) {
        console.time("test");
        canvas = document.getElementById("canvasTest");

        initWebGL(canvas);      // Initialize the GL context
        console.timeEnd("test");
        // Only continue if WebGL is available and working

        if (gl) {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
            gl.clearDepth(1.0);                 // Clear everything
            gl.enable(gl.DEPTH_TEST);           // Enable depth testing

            //  gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

            //Initialize FBO

            var pixelData = initFbo(image, d);

            // Initialize the shaders; this is where all the lighting for the
            // vertices and so forth is established.

            initShaders();

            // Here's where we call the routine that builds all the objects
            // we'll be drawing.

            initBuffers();

            // Next, load and set up the textures we'll be using.

            //  initTextures(image);

            // createFramebuffer(texture);

            // Set up to draw the scene periodically.
            // setInterval( function() { drawScene(d)}, 15 );
            drawScene(d);


        }

        return pixelData;
    }


    /**
     * GLSL accelerated Grayscale operator
     */
    Xflow.registerOperator("xflow.glDesaturate", {
        outputs: [
            {type: 'texture', name: 'result', sizeof: 'image'}
        ],
        params: [
            {type: 'texture', source: 'image'}
        ],
        evaluate: function (result, image) {

            console.time("dataflowtime");
            var d = result.data;
            start(image, d);
            console.timeEnd("dataflowtime");
        }
    });

    /**
     * GLSL accelerated Invert operator
     */
    Xflow.registerOperator("xflow.glInvert", {
        outputs: [
            {type: 'texture', name: 'result', sizeof: 'image'}
        ],
        params: [
            {type: 'texture', source: 'image'}
        ],
        evaluate: function (result, image) {
            console.time("dataflowtimeSecond");
            var d = result.data;

            d = start(image, d);
            console.timeEnd("dataflowtimeSecond");
        }
    });

}());