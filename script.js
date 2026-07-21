// ---- Safe expression parser (no eval) ------------------------------------
// Supports: + - * / % ^, parentheses, decimals, constants (π, e),
// and functions sin( cos( tan( ln( log( √(
// Trig functions respect the DEG / RAD mode.

const FUNCS = ['sin(', 'cos(', 'tan(', 'ln(', 'log(', '√('];

function tokenize(expr) {
    const tokens = [];
    let i = 0;
    while (i < expr.length) {
        const ch = expr[i];

        if (ch === ' ') { i++; continue; }

        const funcMatch = FUNCS.find(f => expr.startsWith(f, i));
        if (funcMatch) {
            tokens.push({ type: 'func', value: funcMatch.slice(0, -1) });
            tokens.push({ type: 'lparen' });
            i += funcMatch.length;
            continue;
        }

        if (/[0-9.]/.test(ch)) {
            let num = '';
            while (i < expr.length && /[0-9.]/.test(expr[i])) {
                num += expr[i];
                i++;
            }
            tokens.push({ type: 'num', value: parseFloat(num) });
            continue;
        }

        if (ch === 'π') { tokens.push({ type: 'num', value: Math.PI }); i++; continue; }
        if (ch === 'e') { tokens.push({ type: 'num', value: Math.E }); i++; continue; }

        if (ch === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
        if (ch === ')') { tokens.push({ type: 'rparen' }); i++; continue; }

        if ('+-*/^%'.includes(ch)) {
            tokens.push({ type: 'op', value: ch });
            i++;
            continue;
        }

        // Unknown character — skip it rather than silently corrupting the expression
        i++;
    }
    return tokens;
}

function autoCloseParens(tokens) {
    let depth = 0;
    for (const t of tokens) {
        if (t.type === 'lparen') depth++;
        if (t.type === 'rparen') depth--;
    }
    while (depth > 0) {
        tokens.push({ type: 'rparen' });
        depth--;
    }
    return tokens;
}

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }
    peek() { return this.tokens[this.pos]; }
    next() { return this.tokens[this.pos++]; }

    parseExpression() {
        let left = this.parseTerm();
        while (this.peek() && this.peek().type === 'op' && '+-'.includes(this.peek().value)) {
            const op = this.next().value;
            const right = this.parseTerm();
            left = op === '+' ? left + right : left - right;
        }
        return left;
    }

    parseTerm() {
        let left = this.parseFactor();
        while (this.peek() && this.peek().type === 'op' && '*/%'.includes(this.peek().value)) {
            const op = this.next().value;
            const right = this.parseFactor();
            if (op === '*') left = left * right;
            else if (op === '/') left = left / right;
            else left = left % right;
        }
        return left;
    }

    parseFactor() {
        const base = this.parseUnary();
        if (this.peek() && this.peek().type === 'op' && this.peek().value === '^') {
            this.next();
            const exponent = this.parseFactor(); // right-associative
            return Math.pow(base, exponent);
        }
        return base;
    }

    parseUnary() {
        if (this.peek() && this.peek().type === 'op' && this.peek().value === '-') {
            this.next();
            return -this.parseUnary();
        }
        return this.parsePrimary();
    }

    parsePrimary() {
        const tok = this.peek();
        if (!tok) throw new Error('Unexpected end of expression');

        if (tok.type === 'num') {
            this.next();
            return tok.value;
        }

        if (tok.type === 'func') {
            const name = this.next().value;
            this.next(); // consume lparen
            const arg = this.parseExpression();
            if (this.peek() && this.peek().type === 'rparen') this.next();
            return applyFunc(name, arg);
        }

        if (tok.type === 'lparen') {
            this.next();
            const val = this.parseExpression();
            if (this.peek() && this.peek().type === 'rparen') this.next();
            return val;
        }

        throw new Error('Unexpected token');
    }
}

function applyFunc(name, arg) {
    const mode = getMode(); // 'deg' or 'rad'
    const toRad = (v) => (mode === 'deg' ? (v * Math.PI) / 180 : v);
    switch (name) {
        case 'sin': return Math.sin(toRad(arg));
        case 'cos': return Math.cos(toRad(arg));
        case 'tan': return Math.tan(toRad(arg));
        case 'ln': return Math.log(arg);
        case 'log': return Math.log10(arg);
        case '√': return Math.sqrt(arg);
        default: throw new Error('Unknown function: ' + name);
    }
}

function evaluate(expr) {
    if (!expr.trim()) return 0;
    const tokens = autoCloseParens(tokenize(expr));
    const parser = new Parser(tokens);
    const result = parser.parseExpression();
    if (typeof result !== 'number' || !isFinite(result)) throw new Error('Invalid result');
    return result;
}

// ---- UI wiring ------------------------------------------------------------

const input = document.getElementById('inputBox');
const trace = document.getElementById('trace');
const modeButtons = document.querySelectorAll('.mode-btn');
const calculator = document.querySelector('.calculator');

let expression = '';
let angleMode = 'deg';

function getMode() {
    return angleMode;
}

modeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        angleMode = btn.getAttribute('data-mode');
        modeButtons.forEach(b => b.classList.toggle('active', b === btn));
    });
});

function render() {
    input.value = expression;
    calculator.classList.remove('error');
}

function showError() {
    calculator.classList.add('error');
    input.value = 'Error';
}

document.querySelectorAll('button[data-insert], button[data-action]').forEach(button => {
    button.addEventListener('click', () => {
        const insert = button.getAttribute('data-insert');
        const action = button.getAttribute('data-action');

        if (action === 'clear') {
            expression = '';
            trace.innerHTML = '&nbsp;';
            render();
            return;
        }

        if (action === 'delete') {
            // Remove one function keyword at a time if the expression ends with one
            const funcHit = FUNCS.find(f => expression.endsWith(f));
            expression = funcHit ? expression.slice(0, -funcHit.length) : expression.slice(0, -1);
            render();
            return;
        }

        if (action === 'equals') {
            try {
                const result = evaluate(expression);
                trace.textContent = expression + ' =';
                expression = String(round(result));
                render();
            } catch (e) {
                showError();
                expression = '';
            }
            return;
        }

        if (insert) {
            expression += insert;
            render();
        }
    });
});

function round(n) {
    // Avoid ugly floating point tails while keeping useful precision
    return Math.round(n * 1e10) / 1e10;
}

// Keyboard support
window.addEventListener('keydown', (e) => {
    const key = e.key;
    if (/[0-9.]/.test(key)) { expression += key; render(); return; }
    if (['+', '-', '*', '/', '%', '^', '(', ')'].includes(key)) { expression += key; render(); return; }
    if (key === 'Enter' || key === '=') {
        e.preventDefault();
        document.querySelector('[data-action="equals"]').click();
        return;
    }
    if (key === 'Backspace') { document.querySelector('[data-action="delete"]').click(); return; }
    if (key === 'Escape') { document.querySelector('[data-action="clear"]').click(); return; }
});
