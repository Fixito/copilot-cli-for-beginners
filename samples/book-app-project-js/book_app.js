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
    const avg = collection.getAverageRating(book.title);
    const ratingStr = avg === null ? 'No rating' : `Avg: ${avg.toFixed(2)}`;
    console.log(`${index + 1}. [${status}] ${book.title} by ${book.author} (${book.year}) - ${ratingStr}`);
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

async function handleAddReview(args) {
  // args may be: ['review', 'add', '<title>', '<rating>', '<text...>']
  let title = args && args.length > 2 ? args.slice(2, 3).join(' ').trim() : undefined;
  let rating = args && args.length > 3 ? args[3] : undefined;
  let text = args && args.length > 4 ? args.slice(4).join(' ').trim() : undefined;
  if (!title) {
    title = await prompt('Book title: ');
  }
  if (!rating) {
    rating = await prompt('Rating (1-5): ');
  }
  if (!text) {
    text = await prompt('Review text (optional): ');
  }
  try {
    const r = Number(rating);
    collection.addReview(title, r, text);
    console.log('\nReview added.\n');
  } catch (err) {
    console.error('\nError adding review:', err.message || err);
  }
}

async function handleListReviews(args) {
  let title = args && args.length > 1 ? args.slice(1).join(' ').trim() : undefined;
  if (!title) title = await prompt('Book title: ');
  try {
    const reviews = collection.listReviews(title);
    if (!reviews || reviews.length === 0) {
      console.log('\nNo reviews found.\n');
      return;
    }
    console.log(`\nReviews for ${title}:\n`);
    reviews.forEach((r, i) => {
      console.log(`${i}. Rating: ${r.rating} — ${r.text}`);
    });
    console.log();
  } catch (err) {
    console.error('\nError listing reviews:', err.message || err);
  }
}

async function handleReviewStats(args) {
  let title = args && args.length > 1 ? args.slice(1).join(' ').trim() : undefined;
  if (title) {
    const avg = collection.getAverageRating(title);
    if (avg === null) console.log('\nNo ratings for this book.\n');
    else console.log(`\nAverage rating for ${title}: ${avg.toFixed(2)}\n`);
  } else {
    const books = collection.listBooks();
    console.log('\nAverage ratings:');
    books.forEach((b) => {
      const avg = collection.getAverageRating(b.title);
      const s = avg === null ? 'No rating' : avg.toFixed(2);
      console.log(`- ${b.title}: ${s}`);
    });
    console.log();
  }
}

async function handleEditReview(args) {
  let title = args && args.length > 2 ? args.slice(2,3).join(' ').trim() : undefined;
  let index = args && args.length > 3 ? Number(args[3]) : undefined;
  if (!title) title = await prompt('Book title: ');
  if (index === undefined || Number.isNaN(index)) index = Number(await prompt('Review index to edit: '));
  const newRating = await prompt('New rating (1-5, leave blank to keep): ');
  const newText = await prompt('New text (leave blank to keep): ');
  try {
    const updates = {};
    if (newRating && newRating.trim() !== '') updates.rating = Number(newRating);
    if (newText && newText.trim() !== '') updates.text = newText;
    collection.editReview(title, index, updates);
    console.log('\nReview updated.\n');
  } catch (err) {
    console.error('\nError editing review:', err.message || err);
  }
}

async function handleRemoveReview(args) {
  let title = args && args.length > 2 ? args.slice(2,3).join(' ').trim() : undefined;
  let index = args && args.length > 3 ? Number(args[3]) : undefined;
  if (!title) title = await prompt('Book title: ');
  if (index === undefined || Number.isNaN(index)) index = Number(await prompt('Review index to remove: '));
  try {
    collection.removeReview(title, index);
    console.log('\nReview removed.\n');
  } catch (err) {
    console.error('\nError removing review:', err.message || err);
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
  review add   - Add a review (interactive or: review add <title> <rating> [text])
  review list  - List reviews for a book (interactive or: review list <title>)
  review stats - Show average rating for a book or all books
  review edit  - Edit a review by index
  review remove- Remove a review by index
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
  review: async (args) => {
    const sub = args.length > 1 ? args[1].toLowerCase() : 'list';
    switch (sub) {
      case 'add':
        await handleAddReview(args);
        break;
      case 'list':
        await handleListReviews(args.slice(1));
        break;
      case 'stats':
        await handleReviewStats(args.slice(1));
        break;
      case 'edit':
        await handleEditReview(args);
        break;
      case 'remove':
        await handleRemoveReview(args);
        break;
      default:
        console.log('Unknown review subcommand.');
        break;
    }
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
