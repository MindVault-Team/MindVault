/**
 * Secure mathematical expression tokenizer, parser (Shunting-yard), and evaluator.
 * Fully complies with CSP constraints by avoiding eval() and Function().
 */

interface Operator {
  precedence: number;
  associativity: "left" | "right";
}

const operators: Record<string, Operator> = {
  "+": { precedence: 2, associativity: "left" },
  "-": { precedence: 2, associativity: "left" },
  "*": { precedence: 3, associativity: "left" },
  "/": { precedence: 3, associativity: "left" },
  "^": { precedence: 4, associativity: "right" },
  "u-": { precedence: 5, associativity: "right" }, // Unary minus
  "u+": { precedence: 5, associativity: "right" }, // Unary plus
};

const functions = new Set(["sin", "cos", "tan", "sqrt", "abs", "exp", "log", "ln"]);

/**
 * Normalizes and preprocesses implicit multiplications (e.g., "2x" -> "2*x").
 */
export function preprocessExpression(expr: string): string {
  // Normalize whitespaces and lowercase
  let cleaned = expr.replace(/\s+/g, "").toLowerCase();

  // Handle implicit multiplication:
  // 1. Digit followed by letter/variable (e.g. 2x -> 2*x)
  cleaned = cleaned.replace(/(\d)(?=[a-zA-Z])/g, "$1*");
  // 2. Digit followed by open parenthesis (e.g. 2(x) -> 2*(x))
  cleaned = cleaned.replace(/(\d)(?=\()/g, "$1*");
  // 3. Variable 'x' followed by open parenthesis (e.g. x(x+1) -> x*(x+1))
  cleaned = cleaned.replace(/(x)(?=\()/g, "$1*");
  // 4. Closing parenthesis followed by open parenthesis (e.g. (x)(y) -> (x)*(y))
  cleaned = cleaned.replace(/\)(?=\()/g, ")*");
  // 5. Closing parenthesis followed by letter/variable (e.g. (x)x -> (x)*x)
  cleaned = cleaned.replace(/\)(?=[a-zA-Z])/g, ")*");

  return cleaned;
}

/**
 * Tokenizes the preprocessed mathematical expression.
 */
export function tokenize(expr: string): string[] {
  const tokens: string[] = [];
  let i = 0;

  while (i < expr.length) {
    const char = expr[i];

    if (char === " " || char === "\t" || char === "\r" || char === "\n") {
      i++;
      continue;
    }

    if (["+", "-", "*", "/", "^", "(", ")"].includes(char)) {
      tokens.push(char);
      i++;
      continue;
    }

    // Match numbers (including decimals)
    if (/\d/.test(char) || char === ".") {
      let numStr = "";
      while (i < expr.length && (/\d/.test(expr[i]) || expr[i] === ".")) {
        numStr += expr[i];
        i++;
      }
      tokens.push(numStr);
      continue;
    }

    // Match alphabet words (functions, constants, variable)
    if (/[a-zA-Z]/.test(char)) {
      let word = "";
      while (i < expr.length && /[a-zA-Z]/.test(expr[i])) {
        word += expr[i];
        i++;
      }
      tokens.push(word);
      continue;
    }

    // Unrecognized character, skip to avoid infinite loops
    i++;
  }

  return tokens;
}

/**
 * Converts infix math tokens to RPN (Reverse Polish Notation) using Shunting-yard algorithm.
 */
export function parseToRpn(tokens: string[]): string[] {
  const outputQueue: string[] = [];
  const operatorStack: string[] = [];

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];

    // If it's a number
    if (/^\d+(\.\d+)?$/.test(token)) {
      outputQueue.push(token);
    }
    // If it's a variable or constant
    else if (token === "x" || token === "pi" || token === "e") {
      outputQueue.push(token);
    }
    // If it's a function
    else if (functions.has(token)) {
      operatorStack.push(token);
    }
    // If it's an operator
    else if (["+", "-", "*", "/", "^"].includes(token)) {
      let op = token;
      const prevToken = idx > 0 ? tokens[idx - 1] : null;
      const isUnary =
        prevToken === null || prevToken === "(" || ["+", "-", "*", "/", "^"].includes(prevToken);

      if (isUnary) {
        if (op === "-") op = "u-";
        else if (op === "+") op = "u+";
      }

      while (operatorStack.length > 0) {
        const top = operatorStack[operatorStack.length - 1];
        if (top === "(") break;

        const isTopFunc = functions.has(top);
        const topOp = operators[top];
        const currentOp = operators[op];

        if (
          isTopFunc ||
          (topOp &&
            (topOp.precedence > currentOp.precedence ||
              (topOp.precedence === currentOp.precedence && currentOp.associativity === "left")))
        ) {
          outputQueue.push(operatorStack.pop()!);
        } else {
          break;
        }
      }
      operatorStack.push(op);
    }
    // If it's an open parenthesis
    else if (token === "(") {
      operatorStack.push(token);
    }
    // If it's a closing parenthesis
    else if (token === ")") {
      let foundOpen = false;
      while (operatorStack.length > 0) {
        const top = operatorStack[operatorStack.length - 1];
        if (top === "(") {
          operatorStack.pop();
          foundOpen = true;
          break;
        } else {
          outputQueue.push(operatorStack.pop()!);
        }
      }
      if (!foundOpen) {
        throw new Error("Mismatched parentheses");
      }
      // If the top of the stack is a function, pop it
      if (operatorStack.length > 0 && functions.has(operatorStack[operatorStack.length - 1])) {
        outputQueue.push(operatorStack.pop()!);
      }
    }
    // Unrecognized token
    else {
      throw new Error(
        `Unknown token: '${token}'. Supported variables: x, pi, e. Supported functions: ${Array.from(functions).join(", ")}.`
      );
    }
  }

  while (operatorStack.length > 0) {
    const top = operatorStack.pop()!;
    if (top === "(" || top === ")") {
      throw new Error("Mismatched parentheses");
    }
    outputQueue.push(top);
  }

  return outputQueue;
}

/**
 * Evaluates RPN tokens for a specific value of variable x.
 */
export function evaluateRpn(rpn: string[], x: number): number {
  const stack: number[] = [];

  for (const token of rpn) {
    if (/^\d+(\.\d+)?$/.test(token)) {
      stack.push(parseFloat(token));
    } else if (token === "x") {
      stack.push(x);
    } else if (token === "pi") {
      stack.push(Math.PI);
    } else if (token === "e") {
      stack.push(Math.E);
    } else if (operators[token]) {
      if (token === "u-") {
        const val = stack.pop();
        if (val === undefined) throw new Error("Malformed expression stack");
        stack.push(-val);
      } else if (token === "u+") {
        const val = stack.pop();
        if (val === undefined) throw new Error("Malformed expression stack");
        stack.push(val);
      } else {
        const b = stack.pop();
        const a = stack.pop();
        if (a === undefined || b === undefined) throw new Error("Malformed expression stack");

        switch (token) {
          case "+":
            stack.push(a + b);
            break;
          case "-":
            stack.push(a - b);
            break;
          case "*":
            stack.push(a * b);
            break;
          case "/":
            stack.push(a / b);
            break;
          case "^":
            stack.push(Math.pow(a, b));
            break;
        }
      }
    } else if (functions.has(token)) {
      const val = stack.pop();
      if (val === undefined) throw new Error("Malformed expression stack");

      switch (token) {
        case "sin":
          stack.push(Math.sin(val));
          break;
        case "cos":
          stack.push(Math.cos(val));
          break;
        case "tan":
          stack.push(Math.tan(val));
          break;
        case "sqrt":
          stack.push(Math.sqrt(val));
          break;
        case "abs":
          stack.push(Math.abs(val));
          break;
        case "exp":
          stack.push(Math.exp(val));
          break;
        case "log":
        case "ln":
          stack.push(Math.log(val));
          break;
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error("Invalid expression evaluation: stack didn't resolve to a single value");
  }

  return stack[0];
}

/**
 * Convenience function to parse and evaluate an expression for a specific x.
 */
export function evaluateExpression(expr: string, x: number): number {
  const prepped = preprocessExpression(expr);
  const tokens = tokenize(prepped);
  const rpn = parseToRpn(tokens);
  return evaluateRpn(rpn, x);
}
