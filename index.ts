#!/usr/bin/env node

import { KagiClient } from "./kagi.js";

import express from "express";
import { z } from "zod";

import { Server, ServerOptions } from "@modelcontextprotocol/sdk/server/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Implementation } from "@modelcontextprotocol/sdk/types.js";


function addTools(mcpServer: McpServer, kagiClient: KagiClient) {
	mcpServer.tool(
		"kagi_search",
		"Perform web search using Kagi",
		{
			query: z.string(),
			limit: z.optional(z.number())
		},
		async ({ query, limit }) => {
			try {
				if (limit && (limit < 1 || limit > 100)) {
					throw new Error("Invalid limit value");
				}
				const searchResult = await kagiClient.search(query, limit);

				if (searchResult.error) {
					throw new Error(`${searchResult.error[0].msg || "unknown error"}`);
				}

				if (!searchResult.data || searchResult.data.length < 1) {
					throw new Error("Didn't get any results");
				}

				const resultString = searchResult.data.map((item, index) => {
					let result = `${index+1}: ${item.title || ""}`;
					result += `\n${item.url || ""}`;
					result += `\n${item.snippet || ""}`;
					return result;
				}).join("\n");

				return {
					content: [{
						type: "text",
						text: `-----\nResults for search query\n-----\n${resultString}`
					}]
				};
			} catch (err: unknown) {
				const error = err as Error;
				return {
					content: [{
						type: "text",
						text: `Error: ${error.message}`
					}],
					isError: true
				};
			}
		}
	);
}


function serverInfo(): Implementation {
	return {
		name: "mcp-kagi-search",
		version: "0.1.0"
	}
}

function serverOptions(): ServerOptions {
	return {
		capabilities: {
			tools: {}
		}
	}
}

async function runServer(port: number | null, kagiClient: KagiClient) {
	if (port != null) {
		const app = express();

		let servers: Server[] = [];

		app.get("/sse", async (req, res) => {
			console.debug("Received request for a new SSE connection");

			const transport = new SSEServerTransport("/message", res);
			const mcpServer = new McpServer(serverInfo(), serverOptions());

			addTools(mcpServer, kagiClient);
			
			const server = mcpServer.server;
			server.onclose = () => {
				console.debug("SSE connection closed");
				servers = servers.filter((s) => s !== server);
			};

			console.debug("Transport uses sessionId: " + transport.sessionId);

			servers.push(mcpServer.server);

			await mcpServer.connect(transport);
		});

		app.post("/message", async (req, res) => {
			const sessionId = req.query.sessionId as string;
			if (!sessionId) {
				console.warn("Received message without a valid session");
				res.status(400).send("Session not found");
				return;
			}

			const transport = servers
				.map((s) => s.transport as SSEServerTransport)
				.find((t) => t.sessionId === sessionId);

			if (!transport) {
				console.info("Session not found");
				res.status(404).send("Session not found");
				return;
			}

			await transport.handlePostMessage(req, res);
		});

		app.listen(port, "::", () => {
			console.log(`Server running on all interfaces, please open http://localhost:${port}/sse`);
		});
	} else {
		const mcpServer = new McpServer(
			serverInfo(),
			serverOptions()
		);

		addTools(mcpServer, kagiClient);

		const transport = new StdioServerTransport();
		await mcpServer.connect(transport);

		console.error("Server running on stdio");
	}
}


// IMPROVEMENT ? TODO: Maybe add some rate limiting to this MCP server.
// look at https://github.com/modelcontextprotocol/servers/blob/0d12ab326374e6883cdeb89a9d16c06ed1043c7e/src/brave-search/index.ts#L88-L111
// Set the limits in environment variables

const args = process.argv.slice(2);
const port = args[0] ? parseInt(args[0]) : null;

const KAGI_API_KEY = process.env.KAGI_API_KEY!;
if (!KAGI_API_KEY) {
	console.error("Error: KAGI_API_KEY environment variable is required");
	process.exit(1);
}

const kagiClient = new KagiClient(KAGI_API_KEY);


runServer(port, kagiClient).catch((error) => {
	console.error(error);
	process.exit(1);
});
