import json
import os

import requests

API_URL = "https://openrouter.ai/api/v1/chat/completions"
API_KEY = os.getenv("OPENROUTER_API_KEY")

if not API_KEY:
    raise RuntimeError("Missing OPENROUTER_API_KEY environment variable")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json",
}

# First API call with reasoning enabled.
first_payload = {
    "model": "moonshotai/kimi-k2.5",
    "messages": [
        {
            "role": "user",
            "content": "How many r's are in the word 'strawberry'?",
        }
    ],
    "reasoning": {"enabled": True},
}

response = requests.post(
    url=API_URL,
    headers=headers,
    data=json.dumps(first_payload),
    timeout=60,
)
response.raise_for_status()

assistant_message = response.json()["choices"][0]["message"]

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

# Second API call: continue reasoning from the preserved reasoning_details.
second_payload = {
    "model": "moonshotai/kimi-k2.5",
    "messages": messages,
    "reasoning": {"enabled": True},
}

response2 = requests.post(
    url=API_URL,
    headers=headers,
    data=json.dumps(second_payload),
    timeout=60,
)
response2.raise_for_status()

final_message = response2.json()["choices"][0]["message"]
print(final_message.get("content", ""))
