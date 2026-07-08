// A simple hello world function

export function hello(name?: string): string {
  return `Hello, ${name ?? 'world'}!`;
}

// Test the function
export function testHello() {
  console.log(hello()); // Hello, world!
  console.log(hello('Chimera')); // Hello, Chimera!
}

// Only run tests in Node.js environment
if (typeof require !== 'undefined' && require.main === module) {
  testHello();
}