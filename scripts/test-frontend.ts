import { runPrivacyTests } from "../ui/utils/privacy.ts";
import { AppError, toAppError } from "../ui/services/ipcResult.ts";
import { resolveVaultPath } from "../ui/services/vaults.ts";
import { sanitizeSvgText } from "../ui/utils/svgSanitizer.ts";
import type { Node, Vault } from "../ui/ipc.ts";

function runDoorServiceTests() {
  const assertAppError = (val: unknown, expectedMessage: string, testName: string) => {
    const res = toAppError(val);
    if (!(res instanceof AppError)) {
      throw new Error(`${testName} Failed: Expected result to be an instance of AppError`);
    }
    if (res.message !== expectedMessage) {
      throw new Error(
        `${testName} Failed: Expected message '${expectedMessage}', got '${res.message}'`
      );
    }
  };

  // Test 1: toAppError with an existing AppError
  const appErr = new AppError("Already an AppError");
  const res1 = toAppError(appErr);
  if (res1 !== appErr) {
    throw new Error("toAppError Test 1 Failed: Expected identical instance reference");
  }

  // Test 2: toAppError with standard built-in Error
  assertAppError(
    new Error("Standard built-in error message"),
    "Standard built-in error message",
    "Test 2"
  );

  // Test 3: toAppError with primitive string value
  assertAppError("Raw string error", "Raw string error", "Test 3");

  // Test 4: toAppError with an arbitrary object
  assertAppError({ foo: "bar" }, "[object Object]", "Test 4");

  // Test 5: toAppError with custom subclass of Error
  class CustomError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "CustomError";
    }
  }
  assertAppError(new CustomError("My custom error"), "My custom error", "Test 5");

  // Test 6: toAppError with object containing .message property
  assertAppError(
    { message: "Object with message property" },
    "Object with message property",
    "Test 6"
  );

  // Test 7: toAppError with object containing .error property
  assertAppError({ error: "Object with error property" }, "Object with error property", "Test 7");

  // Test 8: toAppError with object containing non-string .message property
  assertAppError({ message: 999 }, "999", "Test 8");

  // Test 9: toAppError with object containing non-string .error property
  assertAppError({ error: true }, "true", "Test 9");

  // Test 10: toAppError with primitive number value
  assertAppError(500, "500", "Test 10");

  // Test 11: toAppError with primitive boolean value
  assertAppError(false, "false", "Test 11");

  // Test 12: toAppError with null
  assertAppError(null, "null", "Test 12");

  // Test 13: toAppError with undefined
  assertAppError(undefined, "undefined", "Test 13");

  // Test 14: toAppError with an array
  assertAppError(["error1", "error2"], "error1,error2", "Test 14");

  // Test 15: toAppError with standard Error with empty/missing message
  assertAppError(new Error(""), "Unknown Error", "Test 15");
}

function runVaultServiceTests() {
  const assertResolvedPath = (
    node: Partial<Node>,
    vaults: Partial<Vault>[],
    expected: string,
    testName: string
  ) => {
    const res = resolveVaultPath(node as Node, vaults as Vault[]);
    if (res !== expected) {
      throw new Error(`${testName} Failed: Expected '${expected}', got '${res}'`);
    }
  };

  // Setup mock vaults
  const vault1: Partial<Vault> = { id: "v1", name: "Work", parentVaultId: undefined };
  const vault2: Partial<Vault> = { id: "v2", name: "Projects", parentVaultId: "v1" };
  const vault3 = { id: "v3", name: "MindVault", parent_vault_id: "v1" } as unknown as Vault; // snake_case mock
  const vault4: Partial<Vault> = { id: "v4", name: "DeadEnd", parentVaultId: "nonexistent" };

  // Case A.1: subVaultId set, both exist
  assertResolvedPath(
    { vaultId: "v1", subVaultId: "v2" },
    [vault1, vault2],
    "Work / Projects",
    "resolveVaultPath Test A.1"
  );

  // Case A.2: subVaultId set, only child exists
  assertResolvedPath(
    { vaultId: "nonexistent", subVaultId: "v2" },
    [vault2],
    "Projects",
    "resolveVaultPath Test A.2"
  );

  // Case A.3: subVaultId set, only parent exists
  assertResolvedPath(
    { vaultId: "v1", subVaultId: "nonexistent" },
    [vault1],
    "Work",
    "resolveVaultPath Test A.3"
  );

  // Case A.4: subVaultId set, neither exists
  assertResolvedPath(
    { vaultId: "nonexistent", subVaultId: "nonexistent" },
    [],
    "Unknown Vault",
    "resolveVaultPath Test A.4"
  );

  // Case B.1: subVaultId null, vaultId nonexistent
  assertResolvedPath(
    { vaultId: "nonexistent", subVaultId: null },
    [],
    "Unknown Vault",
    "resolveVaultPath Test B.1"
  );

  // Case B.2: subVaultId null, vaultId exists, no parent
  assertResolvedPath(
    { vaultId: "v1", subVaultId: null },
    [vault1],
    "Work",
    "resolveVaultPath Test B.2"
  );

  // Case B.3: subVaultId null, vaultId exists, parentVaultId exists (camelCase)
  assertResolvedPath(
    { vaultId: "v2", subVaultId: null },
    [vault1, vault2],
    "Work / Projects",
    "resolveVaultPath Test B.3"
  );

  // Case B.4: subVaultId null, vaultId exists, parent_vault_id exists (snake_case)
  assertResolvedPath(
    { vaultId: "v3", subVaultId: null },
    [vault1, vault3],
    "Work / MindVault",
    "resolveVaultPath Test B.4"
  );

  // Case B.5: subVaultId null, vaultId exists, parentVaultId nonexistent in list
  assertResolvedPath(
    { vaultId: "v4", subVaultId: null },
    [vault4],
    "DeadEnd",
    "resolveVaultPath Test B.5"
  );
}

function runSvgSanitizerTests() {
  const assertSanitized = (input: string, expected: string, testName: string) => {
    const res = sanitizeSvgText(input);
    if (res !== expected) {
      throw new Error(`${testName} Failed: Expected '${expected}', got '${res}'`);
    }
  };

  // Test 1: Basic alphanumeric with spaces and hyphens
  assertSanitized("Hello World 123-456", "Hello World 123-456", "Test 1");

  // Test 2: HTML script tags (XSS check)
  assertSanitized("<script>alert('XSS')</script>", "scriptalertXSSscript", "Test 2");

  // Test 3: Standard special characters (should be stripped)
  assertSanitized("Hello! @World# & %^*()_+={}[]|\\:;\"'<>,.?/~`", "Hello World  ", "Test 3");

  // Test 4: Empty string
  assertSanitized("", "", "Test 4");

  // Test 5: Unicode characters (should be stripped due to non-alphanumeric ASCII regex)
  assertSanitized("Hello 世界!", "Hello ", "Test 5");

  // Test 6: Emoji characters (should be stripped)
  assertSanitized("Hello 🚀!", "Hello ", "Test 6");
}

try {
  runPrivacyTests();
  console.log("✓ All frontend privacy utility tests passed successfully!");
  runDoorServiceTests();
  console.log("✓ All doors/IPC error service utility tests passed successfully!");
  runVaultServiceTests();
  console.log("✓ All vaults service utility tests passed successfully!");
  runSvgSanitizerTests();
  console.log("✓ All SVG sanitizer utility tests passed successfully!");
  process.exit(0);
} catch (err) {
  console.error("Frontend utility self-test failed:", err);
  process.exit(1);
}
