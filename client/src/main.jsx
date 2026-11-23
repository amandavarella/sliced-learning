import { createReaderApp } from "./ReaderRoot.jsx";
import { webTrainingSource } from "./trainingSource/index.js";

createReaderApp(webTrainingSource, document.getElementById("root"));
