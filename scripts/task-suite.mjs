// scripts/task-suite.mjs
// Benchmark tasks that can actually discriminate solo from multi-agent (BUG-3).
//
// The old tasks could not: 9/30 combos were "reply with PONG", `code` was
// `return "Hello, " + name`, `debug` flipped `a + b` to `a - b`. A
// cheap-writer + frontier-reviewer design has NO room to add value on those,
// so "multi-agent doesn't beat solo" was a benchmark artifact.
//
// Each task here carries HIDDEN TESTS the model never sees. Grading is
// objective: fraction of assertions that pass against the file on disk.
// Every task hides at least one edge case a careless first draft misses —
// that gap is precisely where a reviewer pass should earn its cost.

export const TASKS = {
  // --- code: one file, several easy-to-miss edge cases -------------------
  code: {
    target: 'slugify.js',
    prompt: [
      'Write a single file named slugify.js in the current directory.',
      'It must export (module.exports) a function slugify(input) that converts',
      'a string to a URL slug:',
      '  - lowercase the text',
      '  - replace any run of non-alphanumeric characters with a single dash',
      '  - strip leading and trailing dashes',
      '  - return an empty string for null, undefined, or non-string input',
      '  - collapse repeated dashes ("a---b" => "a-b")',
      'Do not use any external dependencies.',
    ].join('\n'),
    seed: null,
    tests: [
      ['basic', 'slugify("Hello World")', 'hello-world'],
      ['punctuation', 'slugify("Hello, World!")', 'hello-world'],
      ['collapse dashes', 'slugify("a---b")', 'a-b'],
      ['trim dashes', 'slugify("--wrapped--")', 'wrapped'],
      ['symbol run', 'slugify("a  @@  b")', 'a-b'],
      ['null input', 'slugify(null)', ''],
      ['undefined input', 'slugify(undefined)', ''],
      ['number input', 'slugify(42)', ''],
      ['empty string', 'slugify("")', ''],
      ['already slug', 'slugify("already-slug")', 'already-slug'],
    ],
  },

  // --- debug: TWO bugs, one obvious and one subtle -----------------------
  // The off-by-one is visible on a glance; the empty-array crash is the one a
  // single careless pass ships. A reviewer that catches only the first still
  // scores <1.0, so the metric has headroom.
  debug: {
    target: 'stats.js',
    prompt: [
      'The file stats.js in the current directory has bugs.',
      'lastIndex(arr) should return the index of the final element,',
      'and average(arr) should return the mean of the numbers.',
      'Fix every bug you find and write the corrected file back to stats.js.',
      'Keep both exports and do not rename them.',
    ].join('\n'),
    seed: {
      'stats.js': [
        'function lastIndex(arr) {',
        '  return arr.length; // BUG: off by one',
        '}',
        '',
        'function average(arr) {',
        '  var total = 0;',
        '  for (var i = 0; i < arr.length; i++) total += arr[i];',
        '  return total / arr.length; // BUG: divides by zero on []',
        '}',
        '',
        'module.exports = { lastIndex: lastIndex, average: average };',
        '',
      ].join('\n'),
    },
    tests: [
      ['lastIndex basic', 'm.lastIndex([1,2,3])', 2],
      ['lastIndex single', 'm.lastIndex([9])', 0],
      ['lastIndex empty', 'm.lastIndex([])', -1],
      ['average basic', 'm.average([1,2,3])', 2],
      ['average decimals', 'm.average([1,2])', 1.5],
      ['average empty (subtle)', 'm.average([])', 0],
      ['average single', 'm.average([7])', 7],
    ],
  },

  // --- code_multi: two files that must agree -----------------------------
  // Cross-file consistency is the classic single-pass failure: the writer
  // invents an export name in one file and imports a different one in the
  // other. Nothing in the old suite tested it.
  code_multi: {
    target: 'calc.js',
    prompt: [
      'Create TWO files in the current directory:',
      '  1. mathops.js — exports (module.exports) two functions:',
      '       add(a, b) returning a + b, and mul(a, b) returning a * b.',
      '  2. calc.js — requires ./mathops.js and exports a single function',
      '       calc(op, a, b) where op is the string "add" or "mul".',
      '       calc must call into mathops.js, and must return null for any',
      '       unknown op string.',
      'The two files must agree on the exported names. No dependencies.',
    ].join('\n'),
    seed: null,
    tests: [
      ['calc add', 'm.calc("add",2,3)', 5],
      ['calc mul', 'm.calc("mul",2,3)', 6],
      ['calc unknown op', 'm.calc("pow",2,3)', null],
      ['calc negative', 'm.calc("add",-1,1)', 0],
      ['mathops direct add', 'require("./mathops.js").add(4,5)', 9],
      ['mathops direct mul', 'require("./mathops.js").mul(4,5)', 20],
    ],
  },
};

// Modes that produce a gradeable artifact on disk.
export const GRADEABLE = new Set(['code', 'debug', 'code_multi']);

export function promptFor(mode) {
  return TASKS[mode] ? TASKS[mode].prompt : null;
}
