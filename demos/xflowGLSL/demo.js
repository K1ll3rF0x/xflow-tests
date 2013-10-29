 
              function setupCanvas () {
                try {
                  var canvasImg = document.getElementById("canvasImg");
                  var canvasImgCtx = canvasImg.getContext("2d");
                  var srcImg = document.getElementById("srcimg");
                  canvasImg.width = srcImg.width;
                  canvasImg.height = srcImg.height;
                  canvasImgCtx.drawImage (srcImg, 0, 0, srcImg.width, srcImg.height);
                } catch(e) {
                  document.getElementById("output").innerHTML += "<h3>ERROR:</h3><pre style=\"color:red;\">" + e.message + "</pre>";
                  throw e;
                }
              }
