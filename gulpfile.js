/*eslint-env node */
'use strict';

var gulp = require('gulp');
var eslint = require('gulp-eslint');

gulp.task('lint', function (){
  // Note: To have the process exit with an error code (1) on
  // lint error, return the stream and pipe to failOnError last.
  return gulp.src([
    './**/*.js',
    '!./test/**',
    '!./node_modules/**'
    ])
    .pipe(eslint({
      rules: {
            'space-after-keywords': [2, 'never'],
            indent: [2, 2],
            'valid-jsdoc': 0,
            'func-style': 0,
            'no-use-before-define': 0,
            camelcase: 1,
            'no-unused-vars': 1,
            'no-alert': 1,
            'no-console': 1,
            'no-unused-expressions': 0,
            'consistent-return': 0
        },
        globals: {
          'define': true
        }
    }))
    .pipe(eslint.format())
    .pipe(eslint.failAfterError());
});

