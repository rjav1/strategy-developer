const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // You can define custom functions here to call from frontend
});

module.exports = {
  plugins: [
    require('@tailwindcss/postcss'),
    require('autoprefixer'),
  ],
};