import { Client } from "@notionhq/client";
import { CreatePageParameters } from "@notionhq/client/build/src/api-endpoints";

interface NotionConfig {
  apiKey: string;
  databaseId: string;
}

interface ReportMetadata {
  title: string;
  timestamp: Date;
  poolAddress: string;
  tvl: string;
  currentPrice: string;
  totalPositions: number;
  activePositions: number;
}

/**
 * Initialize Notion client
 */
function initializeNotionClient(apiKey: string): Client {
  return new Client({
    auth: apiKey
  });
}

/**
 * Convert markdown to Notion blocks
 * Note: This is a simplified version. For full markdown support,
 * consider using a library like @tryfabric/martian
 */
function markdownToNotionBlocks(markdown: string): any[] {
  const lines = markdown.split("\n");
  const blocks: any[] = [];
  let currentTable: string[] = [];
  let inTable = false;
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        // End code block
        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: [
              {
                type: "text",
                text: {
                  content: codeBlockContent.join("\n")
                }
              }
            ],
            language: "plain_text"
          }
        });
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        // Start code block
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Handle tables
    if (line.includes("|") && line.trim().startsWith("|")) {
      if (!inTable) {
        inTable = true;
        currentTable = [];
      }
      currentTable.push(line);

      // Check if next line is not a table row
      if (
        i === lines.length - 1 ||
        !lines[i + 1].includes("|") ||
        !lines[i + 1].trim().startsWith("|")
      ) {
        // End of table, convert to Notion table
        blocks.push(createNotionTable(currentTable));
        currentTable = [];
        inTable = false;
      }
      continue;
    }

    // Handle headers
    if (line.startsWith("#")) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const text = line.replace(/^#+\s*/, "");

      if (level === 1) {
        blocks.push({
          object: "block",
          type: "heading_1",
          heading_1: {
            rich_text: [
              {
                type: "text",
                text: { content: text }
              }
            ]
          }
        });
      } else if (level === 2) {
        blocks.push({
          object: "block",
          type: "heading_2",
          heading_2: {
            rich_text: [
              {
                type: "text",
                text: { content: text }
              }
            ]
          }
        });
      } else {
        blocks.push({
          object: "block",
          type: "heading_3",
          heading_3: {
            rich_text: [
              {
                type: "text",
                text: { content: text }
              }
            ]
          }
        });
      }
    }
    // Handle horizontal rules
    else if (line.trim() === "---") {
      blocks.push({
        object: "block",
        type: "divider",
        divider: {}
      });
    }
    // Handle bullet points
    else if (line.trim().startsWith("- ")) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: {
          rich_text: [
            {
              type: "text",
              text: { content: line.replace(/^-\s*/, "") }
            }
          ]
        }
      });
    }
    // Handle numbered lists
    else if (/^\d+\.\s/.test(line.trim())) {
      blocks.push({
        object: "block",
        type: "numbered_list_item",
        numbered_list_item: {
          rich_text: [
            {
              type: "text",
              text: { content: line.replace(/^\d+\.\s*/, "") }
            }
          ]
        }
      });
    }
    // Handle empty lines
    else if (line.trim() === "") {
      // Skip empty lines
      continue;
    }
    // Handle regular paragraphs
    else {
      blocks.push({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: parseInlineMarkdown(line)
        }
      });
    }
  }

  return blocks;
}

/**
 * Parse inline markdown (bold, italic, code, links)
 */
function parseInlineMarkdown(text: string): any[] {
  const richText: any[] = [];

  // Simple implementation - for production use a proper markdown parser
  // This handles basic cases

  // Split by backticks for inline code
  const parts = text.split("`");

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // Regular text - check for bold and italic
      if (parts[i]) {
        richText.push({
          type: "text",
          text: { content: parts[i] },
          annotations: {}
        });
      }
    } else {
      // Code
      if (parts[i]) {
        richText.push({
          type: "text",
          text: { content: parts[i] },
          annotations: {
            code: true
          }
        });
      }
    }
  }

  // If no rich text was added, add the original text
  if (richText.length === 0 && text) {
    richText.push({
      type: "text",
      text: { content: text }
    });
  }

  return richText;
}

/**
 * Create Notion table from markdown table
 */
function createNotionTable(tableLines: string[]): any {
  if (tableLines.length < 3) {
    // Invalid table
    return {
      object: "block",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: { content: tableLines.join("\n") }
          }
        ]
      }
    };
  }

  // Parse table - fixed parsing logic
  const headerLine = tableLines[0];
  const dataLines = tableLines.slice(2); // Skip header and separator

  // Parse headers - remove leading and trailing pipes, then split
  const headers = headerLine
    .replace(/^\|/, "") // Remove leading pipe
    .replace(/\|$/, "") // Remove trailing pipe
    .split("|")
    .map((h) => h.trim());

  // Parse data rows
  const rows: string[][] = [];
  dataLines.forEach((line) => {
    if (line.trim()) {
      const row = line
        .replace(/^\|/, "") // Remove leading pipe
        .replace(/\|$/, "") // Remove trailing pipe
        .split("|")
        .map((cell) => cell.trim());

      // Only add if row has correct number of columns
      if (row.length === headers.length) {
        rows.push(row);
      }
    }
  });

  // Create table block
  const tableBlock: any = {
    object: "block",
    type: "table",
    table: {
      table_width: headers.length,
      has_column_header: true,
      has_row_header: false,
      children: []
    }
  };

  // Add header row
  const headerRow: any = {
    object: "block",
    type: "table_row",
    table_row: {
      cells: headers.map((header) => [
        {
          type: "text",
          text: { content: header },
          annotations: { bold: true }
        }
      ])
    }
  };
  tableBlock.table.children.push(headerRow);

  // Add data rows
  rows.forEach((row) => {
    const tableRow: any = {
      object: "block",
      type: "table_row",
      table_row: {
        cells: row.map((cell) => [
          {
            type: "text",
            text: { content: cell || "" }
          }
        ])
      }
    };
    tableBlock.table.children.push(tableRow);
  });

  return tableBlock;
}

/**
 * Publish markdown report to Notion database
 */
export async function publishReportToNotion(
  markdown: string,
  metadata: ReportMetadata,
  config: NotionConfig
): Promise<string> {
  try {
    const notion = initializeNotionClient(config.apiKey);

    console.log("\n📤 Publishing report to Notion...");
    console.log(`   Database ID: ${config.databaseId}`);

    // Convert markdown to Notion blocks
    const blocks = markdownToNotionBlocks(markdown);

    // Create page in database
    const response = await notion.pages.create({
      parent: {
        type: "database_id",
        database_id: config.databaseId
      },
      properties: {
        // Adjust these property names to match your database schema
        Title: {
          title: [
            {
              text: {
                content: metadata.title
              }
            }
          ]
        },
        "Pool Address": {
          rich_text: [
            {
              text: {
                content: metadata.poolAddress
              }
            }
          ]
        },
        TVL: {
          rich_text: [
            {
              text: {
                content: metadata.tvl
              }
            }
          ]
        },
        "Current Price": {
          rich_text: [
            {
              text: {
                content: metadata.currentPrice
              }
            }
          ]
        },
        "Total Positions": {
          number: metadata.totalPositions
        },
        "Active Positions": {
          number: metadata.activePositions
        },
        Date: {
          date: {
            start: metadata.timestamp.toISOString()
          }
        }
      },
      children: blocks.slice(0, 100) // Notion has a limit of 100 blocks per request
    } as CreatePageParameters);

    // If there are more than 100 blocks, append them in batches
    if (blocks.length > 100) {
      const pageId = response.id;

      for (let i = 100; i < blocks.length; i += 100) {
        const batch = blocks.slice(i, i + 100);
        await notion.blocks.children.append({
          block_id: pageId,
          children: batch
        });

        console.log(
          `   Appended blocks ${i} to ${Math.min(i + 100, blocks.length)}`
        );
      }
    }

    const pageUrl = `https://notion.so/${response.id.replace(/-/g, "")}`;
    console.log(`✅ Report published successfully!`);
    console.log(`   Page URL: ${pageUrl}`);

    return pageUrl;
  } catch (error) {
    console.error("❌ Failed to publish report to Notion:", error);
    throw error;
  }
}

/**
 * Load Notion configuration from environment variables
 */
export function loadNotionConfig(): NotionConfig | null {
  const apiKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_DATABASE_ID;

  if (!apiKey || !databaseId) {
    console.warn("⚠️ Notion configuration not found in environment variables");
    console.warn("   Required: NOTION_API_KEY, NOTION_DATABASE_ID");
    return null;
  }

  return {
    apiKey,
    databaseId: databaseId.replace(/-/g, "") // Remove dashes if present
  };
}

/**
 * Create metadata from pool analysis
 */
export function createReportMetadata(
  poolInfo: any,
  positions: any[],
  timestamp: Date
): ReportMetadata {
  const activePositions = positions.filter(
    (p) =>
      poolInfo.currentTick >= p.tickLowerIndex &&
      poolInfo.currentTick < p.tickUpperIndex
  );

  return {
    title: `Pool Analysis Report - ${timestamp.toLocaleDateString()}`,
    timestamp,
    poolAddress: poolInfo.poolAddress,
    tvl: poolInfo.tvl,
    currentPrice: poolInfo.currentPrice,
    totalPositions: positions.length,
    activePositions: activePositions.length
  };
}
