(function () {

    function logError(e) {
        document.getElementById("output").innerHTML += "<h3>ERROR:</h3><pre style=\"color:red;\">" + e.message + "</pre>";
    }

    // First check if the WebCL extension is installed at all
    if (window.WebCL === undefined) {
        alert("Unfortunately your system does not support WebCL. " +
            "Make sure that you have both the OpenCL driver " +
            "and the WebCL browser extension installed.");
        logError(new Error("No WebCL available!"));
        return;
    }

    /*
     * Selecting device platform and initialising WebCL context
     *
     */

    var platforms = WebCL.getPlatformIDs(),
        platform,
        devices,
        ctx,
        cmdQueue,
        DEFAULT_PLATFORM = "Intel"; // IF CUDA crashes in some point, use "Intel"

    console.log("Available platforms:");

    platforms.forEach(function (p) {
        var name = p.getPlatformInfo(WebCL.CL_PLATFORM_NAME);
        console.log(name);

        if (name.indexOf(DEFAULT_PLATFORM) !== -1) {
            platform = p;
        }
    });

    // Selecting CPU as default platform if DEFAULT_PLATFORM is not available
    if (!platform) {
        platform = platforms[0];
    }

    console.log("Setting platform to: " + platform.getPlatformInfo(WebCL.CL_PLATFORM_NAME));

    ctx = WebCL.createContextFromType([WebCL.CL_CONTEXT_PLATFORM, platform], WebCL.CL_DEVICE_TYPE_DEFAULT);
    devices = ctx.getContextInfo(WebCL.CL_CONTEXT_DEVICES);

    console.log("Available devices on " + platform.getPlatformInfo(WebCL.CL_PLATFORM_NAME) + ":");

    devices.forEach(function (device) {
        console.log(device.getDeviceInfo(WebCL.CL_DEVICE_NAME));
    });

    // Create command queue using the first available device
    cmdQueue = ctx.createCommandQueue(devices[0], 0);


    /**
     * WebCL accelerated Image Thresholding
     *
     */

    (function () {
        var clThresholdImage = "__kernel void clThresholdImage(__global const uchar4* src, __global uchar4* dst, uint width, uint height) " +
                "{ " +
                "int x = get_global_id(0); " +
                "int y = get_global_id(1); " +
                "if (x >= width || y >= height) return; " +
                "int i = y * width + x; " +
                "int color = src[i].x;" +
                "if (color <= 150)" +
                "{" +
                "color= 0;" +
                "}" +
                "dst[i] = (uchar4)(color, color, color, 255);" +
                "}",

            program = ctx.createProgramWithSource(clThresholdImage),
            kernel,
            oldBufSize = 0,
            buffers = {bufIn: null, bufOut: null};

        try {
            program.buildProgram([devices[0]], "");
        } catch (e) {
            alert("Failed to build WebCL program. Error "
                + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_STATUS)
                + ":  " + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_LOG));
            logError(e);
            return;
        }


        try {
            kernel = program.createKernel("clThresholdImage");
        } catch (e) {
            alert("Failed to create WebCL kernel. Error "
                + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_STATUS)
                + ":  " + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_LOG));
            logError(e);
            return;
        }

        Xflow.registerOperator("xflow.clThresholdImage", {
            outputs: [
                {type: 'texture', name: 'result', sizeof: 'image'}
            ],
            params: [
                {type: 'texture', source: 'image'}
            ],

            evaluate: function (result, image) {
                //console.time("clThresholdImage");

                //passing xflow operators input data
                var s = image.data,
                    width = image.width,
                    height = image.height,
                    imgSize = width * height,

                // Setup buffers
                    bufSize = imgSize * 4, // size in bytes
                    bufIn = buffers.bufIn,
                    bufOut = buffers.bufOut;

                if (bufSize !== oldBufSize) {
                    oldBufSize = bufSize;

                    if (bufIn && bufOut) {
                        bufIn.releaseCLResources();
                        bufOut.releaseCLResources();
                    }
                    // Setup WebCL context using the default device of the first available platform
                    bufIn = buffers.bufIn = ctx.createBuffer(WebCL.CL_MEM_READ_ONLY, bufSize);
                    bufOut = buffers.bufOut = ctx.createBuffer(WebCL.CL_MEM_WRITE_ONLY, bufSize);

                }

                kernel.setKernelArg(0, bufIn);
                kernel.setKernelArg(1, bufOut);
                kernel.setKernelArg(2, width, WebCL.types.UINT);
                kernel.setKernelArg(3, height, WebCL.types.UINT);


                // Write the buffer to OpenCL device memory
                cmdQueue.enqueueWriteBuffer(bufIn, false, 0, bufSize, image.data, []);

                // Init ND-range
                var localWS = [16, 4],
                    globalWS = [Math.ceil(width / localWS[0]) * localWS[0],
                        Math.ceil(height / localWS[1]) * localWS[1]];

                // Execute (enqueue) kernel
                cmdQueue.enqueueNDRangeKernel(kernel, globalWS.length, [], globalWS, localWS, []);

                // Read the result buffer from OpenCL device
                cmdQueue.enqueueReadBuffer(bufOut, false, 0, bufSize, result.data, []);

                cmdQueue.finish(); //Finish all the operations

                //console.timeEnd("clThresholdImage");

                return true;
            }

        });
    }());

    /**
     * WebCL accelerated Image Desaturation (gray scaling)
     */

    (function () {
        var clProgramDesaturate = "__kernel void clDesaturate(__global const uchar4* src, __global uchar4* dst, uint width, uint height)" +
                "{" +
                "int x = get_global_id(0);" +
                "int y = get_global_id(1);" +
                "if (x >= width || y >= height) return;" +
                "int i = y * width + x;  uchar4 color = src[i];" +
                "uchar lum = (uchar)(0.30f * color.x + 0.59f * color.y + 0.11f * color.z);" +
                "dst[i] = (uchar4)(lum, lum, lum, 255);" +
                "}",


        // Create and build program
            program = ctx.createProgramWithSource(clProgramDesaturate /* loadKernel("clProgramDesaturate")*/),
            devices = ctx.getContextInfo(WebCL.CL_CONTEXT_DEVICES),
            kernel,
            oldBufSize = 0,
            buffers = {bufIn: null, bufOut: null};


        try {
            program.buildProgram([devices[0]], "");
        } catch (e) {
            alert("Failed to build WebCL program. Error "
                + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_STATUS)
                + ":  " + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_LOG));
            logError(e);
        }

        // Create kernel and set arguments
        try {
            kernel = program.createKernel("clDesaturate");
        } catch (e) {
            alert("Failed to build WebCL program. Error "
                + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_STATUS)
                + ":  " + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_LOG));
            logError(e);
            return;
        }

        Xflow.registerOperator("xflow.clDesaturateImage", {
            outputs: [
                {type: 'texture', name: 'result', sizeof: 'image'}
            ],
            params: [
                {type: 'texture', source: 'image'}
            ],
            evaluate: function (result, image) {
                //console.time("clDesaturate");

                //passing xflow operators input data
                var s = image.data,
                    width = image.width,
                    height = image.height,
                    imgSize = width * height,

                // Setup buffers
                    bufSize = imgSize * 4,
                    bufIn = buffers.bufIn,
                    bufOut = buffers.bufOut;

                if (bufSize !== oldBufSize) {
                    oldBufSize = bufSize;

                    if (bufIn && bufOut) {
                        bufIn.releaseCLResources();
                        bufOut.releaseCLResources();
                    }

                    // Setup WebCL context using the default device of the first available platform
                    bufIn = buffers.bufIn = ctx.createBuffer(WebCL.CL_MEM_READ_ONLY, bufSize);
                    bufOut = buffers.bufOut = ctx.createBuffer(WebCL.CL_MEM_WRITE_ONLY, bufSize);

                }

                kernel.setKernelArg(0, bufIn);
                kernel.setKernelArg(1, bufOut);
                kernel.setKernelArg(2, width, WebCL.types.UINT);
                kernel.setKernelArg(3, height, WebCL.types.UINT);

                // Write the buffer to OpenCL device memory
                cmdQueue.enqueueWriteBuffer(bufIn, false, 0, bufSize, image.data, []);

                // Init ND-range
                var localWS = [16, 4], globalWS = [Math.ceil(width / localWS[0]) * localWS[0],
                    Math.ceil(height / localWS[1]) * localWS[1]];

                // Execute (enqueue) kernel
                cmdQueue.enqueueNDRangeKernel(kernel, globalWS.length, [], globalWS, localWS, []);

                // Read the result buffer from OpenCL device
                cmdQueue.enqueueReadBuffer(bufOut, false, 0, bufSize, result.data, []);

                cmdQueue.finish(); //Finish all the operations

                //console.timeEnd("clDesaturate");
                return true;
            }
        });
    }());

}());