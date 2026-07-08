"use strict";
// A simple hello world function
Object.defineProperty(exports, "__esModule", { value: true });
exports.hello = hello;
exports.testHello = testHello;
function hello(name) {
    return `Hello, ${name ?? 'world'}!`;
}
// Test the function
function testHello() {
    console.log(hello()); // Hello, world!
    console.log(hello('Chimera')); // Hello, Chimera!
}
// Only run tests in Node.js environment
if (typeof require !== 'undefined' && require.main === module) {
    testHello();
}
//# sourceMappingURL=hello.js.map