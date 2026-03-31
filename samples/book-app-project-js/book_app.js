const readline = require('readline');
const { BookCollection } = require('./books');
const { printMenu } = require('./utils');

/**
 * @typedef {Object} Book
 * @property {string} title
 * @property {string} author
 * @property {number|null} year
 * @property {boolean} read
 */

const collection = new BookCollection();

/**
 * Display a list of books.
 * @param {Book[]|null} books
 * @returns {void}
 */
function showBooks(books) {
  if (!books || books.length === 0) {
    console.log('No books found.');
    return;
  }

  console.log('\nYour Book Collection:\n');

  books.forEach((book, index) => {
    const status = book.read ? '✓' : ' ';
    console.log(`${index + 1}. [${status}] ${book.title} by ${book.author} (${book.year})`);
  });

  console.log();
}

/**
 * List books to stdout.
 * @returns {void}
 */
function handleList() {
  try {
    const books = collection.listBooks();
    showBooks(books);
  } catch (err) {
    console.error('\nError listing books:', err.message || err);
  }
}

// Single readline instance for interactive prompts to avoid creating many interfaces
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

/**
 * Prompt the user for input.
 * @param {string} question
 * @returns {Promise<string>}
 */
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Close the interactive prompt.
 * @returns {void}
 */
function closePrompt() {
  try {
    rl.close();
  } catch (err) {
    // ignore
  }
}

/**
 * Interactive: Add a new book.
 * @returns {Promise<void>}
 */
async function handleAdd() {
  console.log('\nAdd a New Book\n');

  const title = await prompt('Title: ');
  const author = await prompt('Author: ');
  const yearStr = await prompt('Year: ');

  try {
    // validation
    if (!title) throw new Error('Title is required.');
    if (!author) throw new Error('Author is required.');
    const year = yearStr && yearStr.trim() !== '' ? parseInt(yearStr, 10) : null;
    if (year !== null && isNaN(year)) throw new Error('Year must be a number.');

    collection.addBook(title, author, year);
    console.log('\nBook added successfully.\n');
  } catch (err) {
    console.log(`\nError: ${err.message}\n`);
  }
}

/**
 * Interactive: Remove a book.
 * @returns {Promise<void>}
 */
async function handleRemove() {
  const title = await prompt('Enter the title of the book to remove: ');
  console.log('\nRemove a Book\n');
  try {
    const removed = collection.removeBook(title);
    if (typeof removed === 'boolean') {
      console.log(removed ? '\nBook removed.\n' : '\nBook not found.\n');
    } else {
      console.log('\nBook removed if it existed.\n');
    }
  } catch (err) {
    console.error('\nError removing book:', err.message || err);
  }
}

/**
 * Interactive: Find books by author.
 * @returns {Promise<void>}
 */
async function handleFind() {
  console.log('\nFind Books (title or author)\n');

  const query = await prompt('Search query (title or author): ');
  try {
    const books = collection.search(query, { fields: ['title', 'author'] });
    showBooks(books);
  } catch (err) {
    console.error('\nError finding books:', err.message || err);
  }
}

function showHelp() {
  console.log(`
Book Collection Helper

Commands:
  list         - Show all books
  add          - Add a new book
  remove       - Remove a book by title
  find         - Find books by title or author
  mark-as-read - Mark a book as read by title
  help         - Show this help message
`);
}

/**
 * Mark a book as read; can be called non-interactively (title provided) or interactively.
 * @param {string|undefined} title
 * @param {string|undefined} dataFile
 * @returns {Promise<boolean>}
 */
async function handleMarkAsReadCLI(title, dataFile) {
  // If title is not provided, prompt the user (interactive case)
  let bookTitle = title;
  if (!bookTitle) {
    bookTitle = await prompt('Enter the title of the book to mark as read: ');
  }

  const coll = dataFile ? new BookCollection(dataFile) : collection;
  try {
    const result = coll.markAsRead(bookTitle);
    if (result) {
      console.log('\nBook marked as read.\n');
    } else {
      console.log('\nBook not found.\n');
    }
    return result;
  } catch (err) {
    console.error('\nError marking book as read:', err.message || err);
    return false;
  }
}

/**
 * Interactive: mark as read.
 * @returns {Promise<void>}
 */
async function handleMarkInteractive() {
  const title = await prompt('Enter the title of the book to mark as read: ');
  try {
    const result = collection.markAsRead(title);
    if (result) {
      console.log('\nBook marked as read.\n');
    } else {
      console.log('\nBook not found.\n');
    }
  } catch (err) {
    console.error('\nError marking book as read:', err.message || err);
  }
}

/**
 * Show interactive menu.
 * @returns {Promise<void>}
 */
async function interactiveMenu() {
  try {
    while (true) {
      printMenu();
      const choice = await prompt('Choose an option: ');
      switch (choice) {
        case '1':
          await handleAdd();
          break;
        case '2':
          handleList();
          break;
        case '3':
          await handleMarkInteractive();
          break;
        case '4':
          await handleRemove();
          break;
        case '5':
          console.log('Goodbye!');
          return;
        default:
          console.log('Unknown option, please try again.');
          break;
      }
    }
  } finally {
    closePrompt();
  }
}

/**
 * Mapping of CLI commands to handlers
 * @type {Object.<string, function(string[]): Promise<void>>}
 */
const commandHandlers = {
  list: async () => {
    handleList();
  },
  add: async () => {
    await handleAdd();
  },
  remove: async (args) => {
    if (args.length > 1) {
      const titleToRemove = args.slice(1).join(' ').trim();
      try {
        const removed = collection.removeBook(titleToRemove);
        console.log(removed ? '\nBook removed.\n' : '\nBook not found.\n');
      } catch (err) {
        console.error('\nError removing book:', err.message || err);
      }
    } else {
      await handleRemove();
    }
  },
  find: async (args) => {
    if (args.length > 1) {
      const authorArg = args.slice(1).join(' ').trim();
      try {
        const books = collection.findByAuthor(authorArg);
        showBooks(books);
      } catch (err) {
        console.error('\nError finding books:', err.message || err);
      }
    } else {
      await handleFind();
    }
  },
  'mark-as-read': async (args) => {
    const titleArg = args.length > 1 ? args.slice(1).join(' ').trim() : undefined;
    await handleMarkAsReadCLI(titleArg);
  },
  help: async () => {
    showHelp();
  },
};

/**
 * CLI entry point: parse and dispatch commands
 * @returns {Promise<void>}
 */
async function main() {
  const args = process.argv.slice(2);

  if (!args || args.length === 0) {
    await interactiveMenu();
    return;
  }

  const command = args[0].toLowerCase();
  const handler = commandHandlers[command];
  if (handler) {
    try {
      await handler(args);
    } catch (err) {
      console.error('\nError executing command:', err.message || err);
    }
  } else {
    console.log('Unknown command.\n');
    showHelp();
  }
}

module.exports = { main, handleMarkAsReadCLI, interactiveMenu };

if (require.main === module) {
  main();
}
