import os
import json
import urllib.request

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    # Try looking for Google API key as fallback
    api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    print("❌ GEMINI_API_KEY (or GOOGLE_API_KEY) is not set in environment variables.")
    print("Please export it: export GEMINI_API_KEY=your_key")
    exit(1)

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"

print(f"🔍 Querying {url.replace(api_key, 'HIDDEN')} ...")

try:
    with urllib.request.urlopen(url) as response:
        data = json.loads(response.read().decode())
        print("✅ AVAILABLE MODELS:")
        found = False
        if "models" in data:
            for m in data["models"]:
                # specialized for generateContent (chat/text)
                methods = m.get("supportedGenerationMethods", [])
                if "generateContent" in methods:
                    print(f" • {m['name']}")
                    found = True
        
        if not found:
            print("⚠️ No models found that support 'generateContent'.")
            print("Raw response:", json.dumps(data, indent=2))
        else:
            print("\n💡 TIP: Use one of these names in your app.") 
            print("   (Note: Litellm usually requires 'gemini/' prefix, e.g. 'gemini/gemini-1.5-flash')")

except Exception as e:
    print(f"❌ Error listing models: {e}")
    if "400" in str(e):
        print("   (This might mean the API Key is invalid)")
