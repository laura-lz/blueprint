from litellm import completion
import os

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("GEMINI_API_KEY not set")
    exit(1)

models_to_test = [
    "gemini/gemini-1.5-flash",
    "gemini/gemini-1.5-flash-latest",
    "gemini/gemini-pro",
    "gemini/gemini-1.5-pro",
]

for model in models_to_test:
    print(f"Testing {model}...")
    try:
        response = completion(
            model=model,
            messages=[{"role": "user", "content": "Hello"}],
            api_key=api_key
        )
        print(f"✅ Success with {model}")
        break
    except Exception as e:
        print(f"❌ Failed with {model}: {e}")
