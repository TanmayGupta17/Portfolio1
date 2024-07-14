import kaboom from "https://unpkg.com/kaboom@3000.1.17/dist/kaboom.mjs";
import { scaleFactor } from "./constants.js";

export const k = kaboom({
  global: false,
  touchToMouse: true,
  canvas: document.getElementById("game"),
  debug: false, // set to false once ready for production
});