# GoodReads RSS to Notion 


## About the Integration
>⚠️ GoodReads RSS feed only lists the last 100 changes

This Notion integration syncs books from Goodreads RSS feed to a Notion Database. This integration was built using this [database template](https://chalk-brake-f8e.notion.site/e3ecc052502d4400ae0c4aed84e238a1?v=4729ecf5e601419897daf45c3f901d0f) and [Cheerio](https://cheerio.js.org/). Changes made to to the following properties in the Notion database will be overwritten by changes on GoodReads:
> - Page
>   - Cover
> - Properties
>   - Book ID
>   - Book ISBN
>   - Author
>   - Shelf
>   - Date

## Running Locally

### 1. Setup your local project

```zsh
# Clone this repository locally
git clone https://github.com/M-rtn/GoodNotion.git

# Switch into this project
cd GoodNotion

# Install the dependencies
npm install
```

### 2. Set your environment variables in a `.env` file

```zsh
NOTION_KEY=<your-notion-api-key>
NOTION_DATABASE_ID=<notion-database-id>
GOODREADS_ID=<goodreads-id>
```

You can create your Notion API key [here](https://www.notion.com/my-integrations).

You can find your Goodreads ID by going to your profile and looking at the URL:
```zsh
https://www.goodreads.com/user/show/<ID>-<NAME>
```

To create a Notion database that will work with this example, duplicate [this empty database template](https://chalk-brake-f8e.notion.site/e3ecc052502d4400ae0c4aed84e238a1?v=4729ecf5e601419897daf45c3f901d0f).

### 3. Run code

```zsh
node index.js
```
