const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl');

if (!gl) {
  alert('WebGL not supported, falling back on experimental-webgl');
  gl = canvas.getContext('experimental-webgl');
}

if (!gl) {
  alert('Your browser does not support WebGL');
}

// Vertex shader program
const vertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_texCoord = a_texCoord;
  }
`;

// Fragment shader program
const fragmentShaderSource = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  void main() {
    gl_FragColor = texture2D(u_image, v_texCoord);
  }
`;

// Compile shaders
function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

// Link shaders into a program
function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

const program = createProgram(gl, vertexShader, fragmentShader);
gl.useProgram(program);

// Set up position and texture coordinate buffers
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
const positions = [
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

const texCoordBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
const texCoords = [
  0, 1,  // Top-left corner
  1, 1,  // Top-right corner
  0, 0,  // Bottom-left corner
  1, 0,  // Bottom-right corner
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

const positionLocation = gl.getAttribLocation(program, 'a_position');
gl.enableVertexAttribArray(positionLocation);
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord');
gl.enableVertexAttribArray(texCoordLocation);
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

let imageTexture;

// Load and create texture from an image
const image = new Image();
image.src = './assets/hanikamu_02.png'; // Path to your preloaded image
image.onload = () => {
  const canvasTmp = document.createElement('canvas');
  const ctxTmp = canvasTmp.getContext('2d');

  const width = 12000;
  const height = 7874;
  canvasTmp.width = width;
  canvasTmp.height = height;
  ctxTmp.drawImage(image, 0, 0, width, height);

  const imageData = ctxTmp.getImageData(0, 0, width, height);

  // Create and bind texture
  imageTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, imageData.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  console.log('Image texture loaded');

  // Set the WebGL viewport to match the canvas size
  resizeCanvas(width, height);

  // Load and parse CSV file
  fetch('./assets/data/01/2024717_16243_fudouike_10min_cooked.csv')
    .then(response => response.text())
    .then(csvText => {
      const chunks = parseCSV(csvText);
      const selectedChunk = chunks[0]; // Select the first chunk for now
      const resampledData = resampleData(selectedChunk, 5100); // Resample
      updateImage(resampledData, imageData, width, height);
    });
};

// Adjust the canvas size to fill the entire screen
function resizeCanvas(canvasWidth, canvasHeight) {
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  gl.viewport(0, 0, canvasWidth, canvasHeight);
  drawScene();
}

// Listen for window resize events
window.addEventListener('resize', resizeCanvas);

// Function to parse CSV text into chunks of data
function parseCSV(csvText) {
  const rows = csvText.split('\n');
  const chunks = [];
  for (let row of rows) {
    if (row.trim() !== '') {
      const values = row.split(',').map(Number);
      chunks.push(values);
    }
  }
  return chunks;
}

// Function to resample data using linear interpolation
function resampleData(data, targetLength) {
  const resampledData = new Array(targetLength);
  const factor = (data.length - 1) / (targetLength - 1);
  for (let i = 0; i < targetLength; i++) {
    const pos = i * factor;
    const low = Math.floor(pos);
    const high = Math.ceil(pos);
    const weight = pos - low;
    resampledData[i] = (1 - weight) * data[low] + weight * data[high];
  }
  return resampledData;
}

// Function to update the image based on data (Normalized) 
function updateImage(data, imageData, width, height) {
  const rowsPerSample = height / data.length; // Adjust based on resampled data length

  // Normalize the intensity values to range [0, 1]
  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const normalizedData = data.map(value => (value - minValue) / (maxValue - minValue));

  const stretchedImageData = new Uint8Array(width * height * 4); // Array to hold stretched image data (RGBA for each pixel)

  for (let y = 0; y < data.length; y++) {
    const value = normalizedData[y];
    const startRow = Math.floor((data.length - 1 - y) * rowsPerSample); // Flip the row index
    const endRow = Math.floor((data.length - y) * rowsPerSample);
    const rowWidth = Math.floor(width * value);

    for (let row = startRow; row < endRow; row++) {
      for (let x = 0; x < rowWidth; x++) {
        const srcIndex = (row * width + Math.floor(x / value)) * 4;
        const destIndex = (row * width + x) * 4;
        stretchedImageData[destIndex] = imageData.data[srcIndex];
        stretchedImageData[destIndex + 1] = imageData.data[srcIndex + 1];
        stretchedImageData[destIndex + 2] = imageData.data[srcIndex + 2];
        stretchedImageData[destIndex + 3] = imageData.data[srcIndex + 3];
      }
    }
  }

  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, stretchedImageData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  console.log('Stretched image texture updated');

  drawScene();
}

// // Function to update the image based on data (Raw)
// function updateImage(data, imageData, width, height) {
//   const rowsPerSample = height / data.length; // Adjust based on resampled data length

//   const maxValue = 50000; // Set your desired maximum intensity value here

//   const stretchedImageData = new Uint8Array(width * height * 4); // Array to hold stretched image data (RGBA for each pixel)

//   for (let y = 0; y < data.length; y++) {
//     const value = data[y] / maxValue; // Scale the value relative to the fixed maximum
//     const startRow = Math.floor((data.length - 1 - y) * rowsPerSample); // Flip the row index
//     const endRow = Math.floor((data.length - y) * rowsPerSample);
//     const rowWidth = Math.floor(width * value);

//     for (let row = startRow; row < endRow; row++) {
//       for (let x = 0; x < rowWidth; x++) {
//           const srcIndex = (row * width + Math.floor(x / value)) * 4;
//           const destIndex = (row * width + x) * 4;
//           stretchedImageData[destIndex] = imageData.data[srcIndex];
//           stretchedImageData[destIndex + 1] = imageData.data[srcIndex + 1];
//           stretchedImageData[destIndex + 2] = imageData.data[srcIndex + 2];
//           stretchedImageData[destIndex + 3] = imageData.data[srcIndex + 3];
//       }
//     }
//   }

//   gl.bindTexture(gl.TEXTURE_2D, imageTexture);
//   gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, stretchedImageData);
//   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
//   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
//   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
//   gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

//   console.log('Stretched image texture updated');

//   drawScene();
// }


// Function to draw the scene
function drawScene() {
  // Clear the canvas with a specific background color (white in this case)
  gl.clearColor(1.0, 1.0, 1.0, 1.0); // White background
  gl.clear(gl.COLOR_BUFFER_BIT);

  if (imageTexture) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
    gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

// Initial draw
drawScene();

// Function to save the canvas as a PNG file
function saveCanvasAsPng() {
  // Ensure the canvas is fully rendered
  drawScene();

  // Save the canvas as a PNG file
  const link = document.createElement('a');
  link.download = 'canvas_image.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// Add event listener to the canvas to save it as a PNG on click
canvas.addEventListener('click', saveCanvasAsPng);
