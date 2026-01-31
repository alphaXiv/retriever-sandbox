<!-- the agent loop should contain a function "runAgentLoop" that can be called using the search query as function argument
the agent loop then runs until the max turn is hit or the model reports document ids

keep appending the messages 
initially just start with the prompt from the prompt.txt file explaining the task and the tools as the first message
pass the messages to the model step (which will contain a call to a vllm server)

the model response (from vllm) is then used to call the environment step
in the env you should parse the text, extract the tool calls and then perform the tool calls
return the documents that were found and the stop condition in case the model has reported it's answer

add the model response and the environment response to the messages and continue the loop if none of the stop criteria have been met

---

- model step
    - host vLLM, put into container, allowing to access through container
- environment step
    - document parsing
        - xml parsing
        - snippets
    - turn counter / limit
    - tools
        - read
        - report helpful ids
        - search
        - text search
    - tool error logic
    - (id obfuscation probably not needed)
    - (token counter)
    - (conversation object)
- agentloop
    - logic for streaming, model step and env step

--- -->

# SID-1 Documentation

- SID-1 is a model optimized for _agentic retrieval_: finding and ranking information in large corpora !through iterative searching. 
- It is designed to supercede the reranker in traditional embedding-reranking pipelines used in Retrieval Augmented Generation (RAG). 
- See our [tech report](https://www.sid.ai/research/sid-1-technical-report) for information on training.

- The model is generally accessible via the [OpenAI chat completions api](https://platform.openai.com/docs/api-reference/chat/create).
- It is the user's responsibility to orchestrate the process of iteratively generating responses from the model and fetching search results.

## The Agent Loop

![SID-1's agent loop](agent-loop-flowchart.svg)

1. Initialise the trace as the system prompt and user input.
2. Generate a response from the model using the chat completions api.
3. Execute the tool calls returned by the model. These should be parallelised to minimize latency.
  - `search` should be a semantic similarity search (like an embedding search).
  - `text_search` should be a full text search.
  - `read` should retrieve the full entry for a specified document id.
  - `report_helpful_ids` should exit the agent loop and return the specified documents.
4. Format the tool call responses:
  - The model performs best if the documents returned by `search` and `text_search`  have a snippet of 50 words of content. We use `TF-IDF` to get this snippet.
  - Each document that is called with `read` should return the full content.
  - Documents should be formatted using XML as in described in [The API call section](#formatting-the-chat-completions-api-call).
5. Add the model generation and tool call responses to the trace and return to step 2.

## Formatting the Chat completions API call

Our model is designed to be accessed via the [OpenAI chat completions api](https://platform.openai.com/docs/api-reference/chat/create).

```json
{
    "model": "sid-1",
    "messages": [
        ...
    ]
    "tools": [
        {"type": "function", "function": {"name": "search"}},
        {"type": "function", "function": {"name": "text_search"}},
        {"type": "function", "function": {"name": "read"}},
        {"type": "function", "function": {"name": "report_helpful_ids"}}
    ]
}
```

Where _messages_ is a list of messages with roles `"system", "user", "assistant", "tool", "assistant", "tool", ....`. The recommended system prompt is given [below](#system-prompt).

```json
"messages": [
  {
      "role": "system", 
      "content": ...
  },
  {
      "role": "user", 
      "content": "What is the capital of Paris?"
  }
]
```

The prior assistant messages can be structured as:

```json
{
    "role": "assistant", 
    "content": ...
    "tool_calls": [
        {
            "function": {
                "name":  "search",
                "arguments": "{\"query\": \"...\"}}",
            }
        },
        ...
    ]
}
```

The prior tool responses can be structured using XML tags to specify documents:

```json
{
    "role": "tool", 
    "content": 
"""<doc id="Ild8" title="Title1">
content ...
</doc>
<doc id="wKZbNzWuB" title="Title2">
content
</doc>

<doc id="nzNBrlaRM" title="Title3">
... content ...
</doc>
<doc id="MV48rO" title="Title4">
... content ...
</doc>"""
}
```

## API call response

The model output will come as a json dict:

```
{
  "id": "chatcmpl-B9MBs8CjcvOU2jLn4n570S5qMJKcT",
  "object": "chat.completion",
  "created": 1741569952,
  "model": "sid-1",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I assist you today?",
        "refusal": null,
        "annotations": []
      },
      "logprobs": null,
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 19,
    "completion_tokens": 10,
    "total_tokens": 29,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0,
      "audio_tokens": 0,
      "accepted_prediction_tokens": 0,
      "rejected_prediction_tokens": 0
    }
  },
  "service_tier": "default"
}



The search tools need to be executed as follows:

## System Prompt

```
You are an expert research assistant that is given a question and must use the provided search tools to find all documents needed to answer the question.

Steps:
1. Reflect on what information is needed to answer the question and use the search tools to find documents. Each document has an id.
2. Repeat step 1 until all documents necessary and sufficient to answer the question have been found. Take as many turns and searches as needed – you can make multiple searches per turn! Most questions will require multiple turns. Most questions require at least 5-8 search requests. Many will need more.
3. Use the report_helpful_ids tool to report the most helpful document ids. List the most helpful document ids first (important!).

The interaction ends once report_helpful_ids is called. You will be scored based on whether you have found all the documents and whether you reported them in the correct order (NDCG)


You have access to the following tools:

- search: performs a semantic search with the query
  - Arguments: query (required), limit (optional, default 5, max 15)
- text_search: performs full-text search using Postgres TS_VECTOR webquery
  - Arguments: query (required), limit (optional, default 5, max 15)
- report_helpful_ids: report helpful document IDs in order (most helpful first)
  - Arguments: ids (required, list of strings)

To use a tool, enclose it within <tool_call> tags with a Python dictionary containing "name" and "arguments". For example:

<tool_call>
{"name": "search", "arguments": {"query": "machine learning algorithms", "limit": 3}}
</tool_call>

The semantic search tool will match things that are conceptually related or use synonyms. This request above would also find texts that talk about linear regression, for example, although "linear regression" does not appear in the query directly. You can write long queries describing the document you want precisely with this tool.


<tool_call>
{"name": "text_search", "arguments": {"query": "data \"dimensionality reduction\" -PCA"}}
</tool_call>

For text_search queries, you can use \"\" (escaped double quotes) to find exact matches for a term. Since the query is inside a JSON string with double quotes, you need to escape the inner double quotes with backslashes (\"dimensionality reduction\"). The above will not return matches that only contain one of "reduction" or "dimensionality" -- it needs both.
You can also use a - to exclude terms (like PCA in the example above). You don't need to use \"\" or - operators, but it can be helpful. If your text_search query has too many terms, there might not be a document that matches all the constraints and no data will be found.


Both search tools return snippets (relevant excerpts) rather than full documents. Snippets are approximately 50 words long and show the most relevant portion of the document based on your query. If the document was truncated, you'll see "..." at the beginning or end.
To read the full document content, use the read tool with the document ID from your search results. You can only read documents that were previously returned by search or text_search.

<tool_call>
{"name": "read", "arguments": {"id": "placeholder_1"}}
</tool_call>

After you've received the tool responses, you can report the helpful document IDs:

<tool_call>
{"name": "report_helpful_ids", "arguments": {"ids": ["placeholder_1", "placeholder_2", "placeholder_3"]}}
</tool_call>