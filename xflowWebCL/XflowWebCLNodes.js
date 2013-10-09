(function () {

    function logError(e) {
        document.getElementById("output").innerHTML += "<h3>ERROR:</h3><pre style=\"color:red;\">" + e.message + "</pre>";
    }

    //Let's create these here to gain a lot of performance
    var platforms = WebCL.getPlatformIDs(),
        ctx = WebCL.createContextFromType([WebCL.CL_CONTEXT_PLATFORM, platforms[0]], WebCL.CL_DEVICE_TYPE_DEFAULT),
        devices = ctx.getContextInfo(WebCL.CL_CONTEXT_DEVICES);

    //console.log(devices[0].getDeviceInfo(WebCL.CL_DEVICE_NAME));

    // First check if the WebCL extension is installed at all
    if (window.WebCL === undefined) {
        alert("Unfortunately your system does not support WebCL. " +
            "Make sure that you have both the OpenCL driver " +
            "and the WebCL browser extension installed.");
        logError(new Error("No WebCL available!"));
        return;
    }


    /**
     * WebCL accelerated Grayscale
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

            program,
            kernels = [],
            kernel,
            i;

        // Create and build program
        for (i = 3; i--;) {
            program = ctx.createProgramWithSource(clThresholdImage);

            try {
                program.buildProgram([devices[0]], "");
            } catch (e) {
                alert("Failed to build WebCL program. Error "
                    + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_STATUS)
                    + ":  " + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_LOG));
                logError(e);
                return;
            }

            // Create kernel and set arguments
            try {
                kernel = program.createKernel("clThresholdImage");
            } catch (e) {
                alert("Failed to create WebCL kernel. Error "
                    + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_STATUS)
                    + ":  " + program.getProgramBuildInfo(devices[0], WebCL.CL_PROGRAM_BUILD_LOG));
                logError(e);
                return;
            }
            kernels.push(kernel);
        }

        Xflow.registerOperator(
            "xflow.clThresholdImage", {
                outputs: [
                    {type: 'texture', name: 'result', sizeof: 'image'}
                ],
                params: [
                    {type: 'texture', source: 'image'}
                ],

                evaluate: function (result, image) {
                    //TODO: Divide processing to 4 separate kernels, slice image in 4 parts

                    //console.time("dataflowtimeWebCL");

                    //passing xflow operators input data
                    var s = image.data,
                        width = image.width,
                        height = image.height;

                    // Setup buffers
                    var imgSize = width * height,
                        bufSize = imgSize * 4; // size in bytes

                    // Setup WebCL context using the default device of the first available platform
                    var bufIn = ctx.createBuffer(WebCL.CL_MEM_READ_ONLY, bufSize),
                        bufOut = ctx.createBuffer(WebCL.CL_MEM_WRITE_ONLY, bufSize);


                    kernels[0].setKernelArg(0, bufIn);
                    kernels[0].setKernelArg(1, bufOut);
                    kernels[0].setKernelArg(2, width, WebCL.types.UINT);
                    kernels[0].setKernelArg(3, height, WebCL.types.UINT);

                    // Create command queue using the first available device
                    var cmdQueue = ctx.createCommandQueue(devices[0], 0);

                    // Write the buffer to OpenCL device memory
                    cmdQueue.enqueueWriteBuffer(bufIn, false, 0, bufSize, image.data, []);

                    // Init ND-range
                    var localWS = [16, 4],
                        globalWS = [Math.ceil(width / localWS[0]) * localWS[0], Math.ceil(height / localWS[1]) * localWS[1]];

                    // Execute (enqueue) kernel

                    cmdQueue.enqueueNDRangeKernel(kernels[0], globalWS.length, [], globalWS, localWS, []);

                    // Read the result buffer from OpenCL device
                    cmdQueue.enqueueReadBuffer(bufOut, false, 0, bufSize, result.data, []);

                    cmdQueue.finish(); //Finish all the operations

                    // console.timeEnd("dataflowtimeWebCL");

                    return true;
                }

            });
    }());

    /**
     * WebCL accelerated Grayscale
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
            kernel;

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
                //TODO: Divide processing to 4 separate kernels, slice image in 4 parts
                //console.time("dataflowtimeWebclSecond");

                //passing xflow operators input data
                var s = image.data,
                    width = image.width,
                    height = image.height;

                // Setup buffers
                var imgSize = width * height,
                    bufSize = imgSize * 4; // size in bytes

                var bufIn = ctx.createBuffer(WebCL.CL_MEM_READ_ONLY, bufSize),
                    bufOut = ctx.createBuffer(WebCL.CL_MEM_WRITE_ONLY, bufSize);

                kernel.setKernelArg(0, bufIn);
                kernel.setKernelArg(1, bufOut);
                kernel.setKernelArg(2, width, WebCL.types.UINT);
                kernel.setKernelArg(3, height, WebCL.types.UINT);

                // Create command queue using the first available device
                var cmdQueue = ctx.createCommandQueue(devices[0], 0);

                // Write the buffer to OpenCL device memory
                cmdQueue.enqueueWriteBuffer(bufIn, false, 0, bufSize, image.data, []);

                // Init ND-range
                var localWS = [16, 4], globalWS = [Math.ceil(width / localWS[0]) * localWS[0], Math.ceil(height / localWS[1]) * localWS[1]];

                // Execute (enqueue) kernel

                cmdQueue.enqueueNDRangeKernel(kernel, globalWS.length, [], globalWS, localWS, []);

                // Read the result buffer from OpenCL device
                cmdQueue.enqueueReadBuffer(bufOut, false, 0, bufSize, result.data, []);

                cmdQueue.finish(); //Finish all the operations

                //console.timeEnd("dataflowtimeWebclSecond");
                return true;
            }
        });
    }());

}());