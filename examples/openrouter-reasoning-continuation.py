import os

import requests

API_URL = "https://openrouter.ai/api/v1/chat/completions"
API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL = os.getenv("OPENROUTER_MODEL", "deepseek/deepseek-v3.2")

if not API_KEY:
    raise RuntimeError("Missing OPENROUTER_API_KEY environment variable")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}


def post_chat(payload: dict) -> dict:
    response = requests.post(
        url=API_URL,
        headers=headers,
        json=payload,
        timeout=60,
    )
    response.raise_for_status()
    return response.json()


# First API call with reasoning enabled.
first_response = post_chat(
    {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": "How many r's are in the word 'strawberry'?",
            }
        ],
        "reasoning": {"enabled": True},
    }
)

assistant_message = first_response["choices"][0]["message"]

# Preserve assistant reasoning details exactly as returned.
messages = [
    {"role": "user", "content": "How many r's are in the word 'strawberry'?"},
    {
        "role": "assistant",
        "content": assistant_message.get("content"),
        "reasoning_details": assistant_message.get("reasoning_details"),
    },
    {"role": "user", "content": "Are you sure? Think carefully."},
]

# Second API call: continue reasoning from preserved reasoning_details.
second_response = post_chat(
    {
        "model": MODEL,
        "messages": messages,
        "reasoning": {"enabled": True},
    }
)

final_message = second_response["choices"][0]["message"]
print(final_message.get("content", ""))
