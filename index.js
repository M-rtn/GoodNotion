/* ================================================================================
	notion-goodreads-sync.
  
  As the RSS feed is limited to the last 100 edits, manual import is needed for
  initial setup if the library exceeds more then a 100 books.
================================================================================ */


const { Client } = require("@notionhq/client")

const cheerio = require("cheerio");
const _ = require("lodash")
const dotenv = require("dotenv");

dotenv.config()
const notion = new Client({ auth: process.env.NOTION_KEY })
const databaseId = process.env.NOTION_DATABASE_ID
const goodReadsId = process.env.GOODREADS_ID

const OPERATION_BATCH_SIZE = 25;


/**
 * Local map to store  GoodReads ID to its Notion pageId.
 * { [bookId: string]: {pageId: string, shelves: string }
 */
 const goodReadsIdToNotionPageId = {}

 /**
 * Initialize local data store.
 * Then sync with GoodReads.
 */
setInitialGoodReadsToNotionIdMap().then(syncNotionDatabaseWithGoodReads)

/**
 * Get and set the initial data store with books currently in the database.
 */
async function setInitialGoodReadsToNotionIdMap() {
  const currentBooks = await getBooksFromNotionDatabase()
  for (const { pageId, bookId, shelves } of currentBooks) {
    goodReadsIdToNotionPageId[bookId] = { pageId, shelves}
  }
}

async function syncNotionDatabaseWithGoodReads() {
    // Get all books from GoodReads
    console.log("\n📚 Fetching books from GoodReads...")
    const books = await getBooksFromGoodreads();
    console.log(`\n📥 ${books.length} books successfully retrieved from GoodReads`);
  
    // Group books into those that need to be created or updated in the Notion database.
    const { pagesToCreate, pagesToUpdate } = getNotionOperations(books)
  
    // Create pages for new books.
    console.log(`\n📚 ${pagesToCreate.length} new books to add to Notion.`)
   await createPages(pagesToCreate)
  
    // Updates pages for existing books.
    console.log(`\n📚 ${pagesToUpdate.length} books to update in Notion.`)
    await updatePages(pagesToUpdate)
  
    // Success!
    console.log("\n✅ Notion database is synced with GoodReads.")
  }



/**
 * Gets books from GoodReads
 *
 * @returns {Promise<Array<{ book_id: string, book_isbn: title: string, author_name: string, user_date_created: string, user_read_at: string, shelves: string, img: string }>>}
 */
 async function getBooksFromGoodreads(){
    const books = [];
   await fetch(`https://www.goodreads.com/review/list_rss/${goodReadsId}?shelf=%23ALL%23`)
    .then(response => response.text())
    .then(
         function(str){
            const $ = cheerio.load(str);

            const shelf = $('title').first().text();
            console.log(`\n🔎 Fetching books from: `+ shelf);
            const lastBuildDate = $('lastBuildDate').text();
            console.log('\n📜 Last RSS Build date: '+formatBuildDate(lastBuildDate))
      
            const items = $('item');
            for (const item of items){
                const $ = cheerio.load(item);  
                 books.push({
                    book_id: parseInt($('book_id').text()),
                    book_isbn: parseInt($('isbn').text()),
                    title: removeCDATA($('title').text()),
                    author_name:$('author_name').text(),
                    user_date_created: parseDate($('user_date_created').html()),
                    user_read_at: parseDate($('user_read_at').html()),
                    shelves: ($('user_shelves').text() ? $('user_shelves').text() : "read"),
                    img: removeCDATA($('book_large_image_url').html())
                 });
                 
            }               
        }
    )
    return books
}

/**
 * Gets pages from the Notion database.
 *
 * @returns {Promise<Array<{ pageId: string, bookId: number, shelves: string }>>}
 */
 async function getBooksFromNotionDatabase() {
  console.log("\`\n📚 Fetching books from Notion...")
    const pages = [];
    let cursor = undefined
    while (true) {
      const { results, next_cursor } = await notion.databases.query({
        database_id: databaseId,
        start_cursor: cursor,
      })
      pages.push(...results)
      if (!next_cursor) {
        break
      }
      cursor = next_cursor
    }
    console.log(`\n📥 ${pages.length} books successfully retrieved from Notion.`)
    return pages.map(page => {
        return {
          pageId: page.id,
          bookId: page.properties?.["Book ID"]?.number,
          shelves: page.properties?.["Shelf"].multi_select?.[0]?.name
        }
      })
  } 

/**
 * Determines which books already exist in the Notion database.
 *
 * @param {Array<{ book_id: string, book_isbn: title: string, author_name: string, user_date_created: string, user_read_at: string, shelves: string, img: string }>} books
 * @returns {{
 *  pagesToCreate: Array<{ book_id: string, book_isbn: title: string, author_name: string, user_date_created: string, user_read_at: string, shelves: string, img: string }>
 *  pagesToUpdate: Array<{ pageId: string, book_id: string, book_isbn: title: string, author_name: string, user_date_created: string, user_read_at: string, shelves: string, img: string}>
 * }}   
 */

  function getNotionOperations(books) {
    const pagesToCreate = []
    const pagesToUpdate = []
    for (const book of books) {
      const pageMap = goodReadsIdToNotionPageId[book.book_id]
      if (Boolean(pageMap?.['pageId'])) {
        if(pageMap?.shelves != book?.shelves){
          pageId = (pageMap['pageId'])
          pagesToUpdate.push({
            ...book,
            pageId,
        })
      }
      } else {
        pagesToCreate.push(book)
      }
    }
    return { pagesToCreate, pagesToUpdate }
  }
/**
 * Creates new pages in Notion.
 *
 * https://developers.notion.com/reference/post-page
 *
 * @param {Array<{ book_id: string, book_isbn: title: string, author_name: string, user_date_created: string, user_read_at: string, shelves: string, img: string }>} pagesToCreate
 */
 async function createPages(pagesToCreate) {
    const pagesToCreateChunks = _.chunk(pagesToCreate, OPERATION_BATCH_SIZE)
    for (const pagesToCreateBatch of pagesToCreateChunks) {
      await Promise.all(
        pagesToCreateBatch.map(book =>
          notion.pages.create({
            parent: { database_id: databaseId },
            cover: {
                type: 'external',
                external: { 
                    url: book.img
                }
            },
            properties: getPropertiesFromBook(book),
          })
        )
      )
      console.log(`Completed batch size: ${pagesToCreateBatch.length}`)
    }
  }
  
  /**
   * Updates provided pages in Notion.
   *
   * https://developers.notion.com/reference/patch-page
   *
   * @param {Array<{ pageId: string, book_id: string, book_isbn: title: string, author_name: string, user_date_created: string, user_read_at: string, shelves: string, img: string}>} pagesToUpdate
   */
  async function updatePages(pagesToUpdate) {
    const pagesToUpdateChunks = _.chunk(pagesToUpdate, OPERATION_BATCH_SIZE)
    for (const pagesToUpdateBatch of pagesToUpdateChunks) {
      await Promise.all(
        pagesToUpdateBatch.map(({ pageId, ...book }) =>
          notion.pages.update({
            page_id: pageId,
            cover: {
                type: 'external',
                external: {
                    url: book.img
                }
            },
            properties: getPropertiesFromBook(book),
          })
        )
      )
      console.log(`Completed batch size: ${pagesToUpdateBatch.length}`)
    }
  }

//*========================================================================
// Helpers
//*========================================================================

/**
 * Removes CDATA labels from RSS feed
 *
 * @param {string} str 
 * @returns {string} 
 */
function removeCDATA(str) {
    return (str.match(/\[CDATA\[(.*?)\]/) ? str.match(/\[CDATA\[(.*?)\]/)?.[1] : str)
}


/**
 * Parse date into correct ISO string
 * 
 * @param {string} str unformatted date string
 * @returns {string} Formatted ISO string
 */

function parseDate(str){
    str = removeCDATA(str)
    if(Date.parse(str)) {
        str = new Date(str);
        return str.toISOString().split('T')[0]; 
    }
    return null
}

/**
 * Calculates last build time in minutes/hours
 * 
 * @param {string} lastBuildtime 
 * @returns {string}
 */

function formatBuildDate(lastBuildtime){
  if(Date.parse(lastBuildtime)) {;
    diff = new Date().getTime() - new Date(lastBuildtime);
    if (diff < 3600000) {
      lastUpdated = `${Math.floor(diff / 60000)} minutes ago`;
    } else if (diff < 86400000) {
      lastUpdated = `${Math.floor(diff / 3600000)} hours ago`;
    } else {
      lastUpdated = `${Math.floor(diff / 86400000)} days ago`;
    }
    return lastUpdated;
  } 
return null
}

/**
 * Returns the Book item conform database's schema properties.
 * For some reason the 'read' shelve shows as an empty string on the RSS, hence the fallback to 'read'
 *
 * @param {{ book_id: string, book_isbn: title: string, author_name: string, user_date_created: string, user_read_at: string, shelves: string }} book
 */
 function getPropertiesFromBook(book) {
    const { book_id, book_isbn, title, author_name, user_date_created, user_read_at, shelves } = book
    return {
      "Name": {
        title: [{ type: "text", text: { content: title } }],
      },
      "Book ID": {
        number: book_id,
      },
      "Book ISBN": {
        number: book_isbn,
      },
      "Author":{
        rich_text: [{ type: 'text', text:{ content: author_name}}]
      },
      "Shelf": (shelves) ? {
        multi_select:[{name: shelves }]} : { multi_select:[{ name: "read"}]
        },
        "Date" : {
            date: {
                start: user_date_created,
                end: user_read_at < user_date_created ?  user_date_created : user_read_at
            }
        },
      "URL":{
          type: 'url',
          url: 'https://www.goodreads.com/book/show/'+book_id
      }
    }
  }
