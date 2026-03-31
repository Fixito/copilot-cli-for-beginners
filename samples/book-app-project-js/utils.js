'use strict';

const readline = require('readline');
const display = require('./display');

/**
 * Print the main menu for the Book Collection App.
 * @returns {void}
 */
function printMenu() {
  console.log('\n📚 Book Collection App');
  console.log('1. Add a book');
  console.log('2. List books');
  console.log('3. Mark book as read');
  console.log('4. Remove a book');
  console.log('5. Exit');
}

/**
 * Delegate printing to the shared display module so formatting is consistent.
 */
function printBooks(books) {
  try {
    display.printBooks(books);
  } catch (err) {
    console.error('Error printing books:', err && err.message ? err.message : err);
  }
}

let rl;
function getReadline() {
  if (!rl) {
    if (!process.stdin.isTTY) {
      throw new Error('Interactive prompts require a TTY');
    }
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  return rl;
}

/**
 * Prompt the user for input.
 * @param {string} question
 * @returns {Promise<string>}
 */
function prompt(question) {
  const reader = getReadline();
  return new Promise((resolve) => {
    reader.question(question, (answer) => {
      resolve(typeof answer === 'string' ? answer.trim() : '');
    });
  });
}

/**
 * Close the interactive prompt.
 * @returns {void}
 */
function closePrompt() {
  try {
    if (rl) {
      rl.close();
      rl = undefined;
    }
  } catch (err) {
    // ignore
  }
}

function printReviews(reviews, title) {
  display.printReviews(reviews, title);
}

module.exports = { printMenu, printBooks, prompt, closePrompt, printReviews };
