import { runPrivacyTests } from "../ui/utils/privacy.ts";

try {
  runPrivacyTests();
  console.log("✓ All frontend privacy utility tests passed successfully!");
  process.exit(0);
} catch (err) {
  console.error("Privacy utility self-test failed:", err);
  process.exit(1);
}
