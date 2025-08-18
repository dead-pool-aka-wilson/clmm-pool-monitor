"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishReportToNotion = publishReportToNotion;
exports.loadNotionConfig = loadNotionConfig;
exports.createReportMetadata = createReportMetadata;
const client_1 = require("@notionhq/client");
/**
 * Initialize Notion client
 */
function initializeNotionClient(apiKey) {
    return new client_1.Client({
        auth: apiKey
    });
}
/**
 * Convert markdown to Notion blocks (동일한 구현 유지)
 */
function markdownToNotionBlocks(markdown) {
    var _a;
    const lines = markdown.split("\n");
    const blocks = [];
    let currentTable = [];
    let inTable = false;
    let inCodeBlock = false;
    let codeBlockContent = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Handle code blocks
        if (line.startsWith("```")) {
            if (inCodeBlock) {
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
            }
            else {
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
            if (i === lines.length - 1 ||
                !lines[i + 1].includes("|") ||
                !lines[i + 1].trim().startsWith("|")) {
                blocks.push(createNotionTable(currentTable));
                currentTable = [];
                inTable = false;
            }
            continue;
        }
        // Handle headers
        if (line.startsWith("#")) {
            const level = ((_a = line.match(/^#+/)) === null || _a === void 0 ? void 0 : _a[0].length) || 1;
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
            }
            else if (level === 2) {
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
            }
            else {
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
        else if (line.trim() === "---") {
            blocks.push({
                object: "block",
                type: "divider",
                divider: {}
            });
        }
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
        else if (line.trim() === "") {
            continue;
        }
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
 * Parse inline markdown
 */
function parseInlineMarkdown(text) {
    const richText = [];
    const parts = text.split("`");
    for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0) {
            if (parts[i]) {
                richText.push({
                    type: "text",
                    text: { content: parts[i] },
                    annotations: {}
                });
            }
        }
        else {
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
function createNotionTable(tableLines) {
    if (tableLines.length < 3) {
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
    const headerLine = tableLines[0];
    const dataLines = tableLines.slice(2);
    const headers = headerLine
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((h) => h.trim());
    const rows = [];
    dataLines.forEach((line) => {
        if (line.trim()) {
            const row = line
                .replace(/^\|/, "")
                .replace(/\|$/, "")
                .split("|")
                .map((cell) => cell.trim());
            if (row.length === headers.length) {
                rows.push(row);
            }
        }
    });
    const tableBlock = {
        object: "block",
        type: "table",
        table: {
            table_width: headers.length,
            has_column_header: true,
            has_row_header: false,
            children: []
        }
    };
    const headerRow = {
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
    rows.forEach((row) => {
        const tableRow = {
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
 * Publish markdown report to Notion database with price change tracking
 */
function publishReportToNotion(markdown, metadata, config) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const notion = initializeNotionClient(config.apiKey);
            console.log("\n📤 Publishing report to Notion...");
            console.log(`   Database ID: ${config.databaseId}`);
            // Convert markdown to Notion blocks
            const blocks = markdownToNotionBlocks(markdown);
            // Prepare properties with new price change fields
            const properties = {
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
            };
            // Add price change properties if available
            if (metadata.priceChangePercent !== undefined) {
                properties["Price Change %"] = {
                    number: metadata.priceChangePercent
                };
            }
            if (metadata.previousPrice !== undefined) {
                properties["Previous Price"] = {
                    rich_text: [
                        {
                            text: {
                                content: metadata.previousPrice.toFixed(6)
                            }
                        }
                    ]
                };
            }
            if (metadata.priceTrend) {
                properties["Price Trend"] = {
                    select: {
                        name: metadata.priceTrend
                    }
                };
            }
            if (metadata.priceAlerts && metadata.priceAlerts.length > 0) {
                properties["Alerts"] = {
                    rich_text: [
                        {
                            text: {
                                content: metadata.priceAlerts.join(" | ")
                            }
                        }
                    ]
                };
            }
            // Create page in database
            const response = yield notion.pages.create({
                parent: {
                    type: "database_id",
                    database_id: config.databaseId
                },
                properties,
                children: blocks.slice(0, 100)
            });
            // If there are more than 100 blocks, append them in batches
            if (blocks.length > 100) {
                const pageId = response.id;
                for (let i = 100; i < blocks.length; i += 100) {
                    const batch = blocks.slice(i, i + 100);
                    yield notion.blocks.children.append({
                        block_id: pageId,
                        children: batch
                    });
                    console.log(`   Appended blocks ${i} to ${Math.min(i + 100, blocks.length)}`);
                }
            }
            const pageUrl = `https://notion.so/${response.id.replace(/-/g, "")}`;
            console.log(`✅ Report published successfully!`);
            console.log(`   Page URL: ${pageUrl}`);
            return pageUrl;
        }
        catch (error) {
            console.error("❌ Failed to publish report to Notion:", error);
            throw error;
        }
    });
}
/**
 * Load Notion configuration from environment variables
 */
function loadNotionConfig() {
    const apiKey = process.env.NOTION_API_KEY;
    const databaseId = process.env.NOTION_DATABASE_ID;
    if (!apiKey || !databaseId) {
        console.warn("⚠️ Notion configuration not found in environment variables");
        console.warn("   Required: NOTION_API_KEY, NOTION_DATABASE_ID");
        return null;
    }
    return {
        apiKey,
        databaseId: databaseId.replace(/-/g, "")
    };
}
/**
 * Create metadata from pool analysis with price change data
 */
function createReportMetadata(poolInfo, positions, timestamp, priceAnalysis) {
    const activePositions = positions.filter((p) => poolInfo.currentTick >= p.tickLowerIndex &&
        poolInfo.currentTick < p.tickUpperIndex);
    const metadata = {
        title: `Pool Analysis Report - ${timestamp.toLocaleDateString()}`,
        timestamp,
        poolAddress: poolInfo.poolAddress,
        tvl: poolInfo.tvl,
        currentPrice: poolInfo.currentPrice,
        totalPositions: positions.length,
        activePositions: activePositions.length
    };
    // Add price change data if available
    if (priceAnalysis) {
        metadata.priceChangePercent = priceAnalysis.priceChangePercent;
        metadata.priceChangeValue = priceAnalysis.priceChange;
        metadata.priceTrend = priceAnalysis.trend;
        metadata.previousPrice = priceAnalysis.previousPrice;
        // Generate alerts
        const alerts = [];
        const absPercent = Math.abs(priceAnalysis.priceChangePercent);
        if (absPercent > 50) {
            alerts.push(`⚠️ EXTREME: ${priceAnalysis.priceChangePercent.toFixed(2)}%`);
        }
        else if (absPercent > 30) {
            alerts.push(`🔔 HIGH: ${priceAnalysis.priceChangePercent.toFixed(2)}%`);
        }
        else if (absPercent > 20) {
            alerts.push(`📢 NOTABLE: ${priceAnalysis.priceChangePercent.toFixed(2)}%`);
        }
        if (alerts.length > 0) {
            metadata.priceAlerts = alerts;
        }
    }
    return metadata;
}
