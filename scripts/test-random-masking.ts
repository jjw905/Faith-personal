import { generateRandomTexts } from "../src/lib/masking/random-conversation";
import { maskPii } from "../src/lib/masking/mask";

for (let i = 0; i < 8; i++) {
  const batch = generateRandomTexts();
  const text = batch.texts.join("\n");
  const result = maskPii(text);
  console.log(batch.title, "matches=", result.matches.length, result.stats);
  if (result.matches.length < 2) {
    console.error(text);
    console.error(result.masked);
    process.exit(1);
  }
}

console.log("random discovery ok");
