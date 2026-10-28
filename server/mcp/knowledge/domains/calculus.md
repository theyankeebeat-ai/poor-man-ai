---
name: calculus
topics: [calculus, derivative, integral, antiderivative, chain rule, power rule, definite integral, indefinite integral, fundamental theorem]
---

# Calculus

This card applies limits, basic derivatives, and power integrals to the function already given.

## Method

1. Decide whether the question asks for a limit, a derivative, or an integral.
2. Rewrite the given expression as constants, sums, and powers before operating.
3. Differentiate with the power rule, the constant-multiple and sum rules, and the chain rule when there is an inside function.
4. For an indefinite integral of x^n with n not equal to -1, write x^(n+1)/(n+1) + C.
5. For a definite integral, evaluate F(b) - F(a) and treat it as net signed area.
6. If the function or the bounds are missing, stop and name what is missing.

## Formulas

- **Limit**: `lim_{x→a} f(x) = L` — L is the value f approaches as x approaches a, which need not equal f(a).
- **Power rule**: `d/dx x^n = n x^(n-1)` — Differentiates a constant power of x by bringing the exponent down and reducing it by one.
- **Constant multiple and sum rules**: `d/dx [c f(x) + g(x)] = c f'(x) + g'(x)` — A constant factor comes out of the derivative, and the derivative of a sum is the sum of the derivatives.
- **Chain rule**: `d/dx f(g(x)) = f'(g(x)) g'(x)` — Differentiate the outer function, then multiply by the derivative of the inner function.
- **Power antiderivative**: `∫ x^n dx = x^(n+1)/(n+1) + C, n ≠ -1` — The antiderivative of a power uses this formula only when the exponent is not -1.
- **Definite integral**: `∫_a^b f(x) dx = F(b) - F(a)` — When F' = f, the fundamental theorem gives the net signed area from a to b.

## Checks

- The power rule multiplies by the old exponent and then lowers that exponent by one.
- The chain rule includes the derivative of the inside function.
- The power antiderivative does not apply when n = -1.
- A definite integral is net signed area, so the result can be negative.

## Limits

- Product, quotient, and integration by parts are outside this card unless the expression reduces to the rules above.
- A limit can exist when the function value at that point does not.
- This card does not supply a function, exponent, or interval the user did not give.
