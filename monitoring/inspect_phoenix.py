import phoenix as px
import inspect

print("Schema signature:")
print(inspect.signature(px.Schema))

print("\nEmbeddingColumnNames signature:")
try:
    print(inspect.signature(px.EmbeddingColumnNames))
except AttributeError:
    print("EmbeddingColumnNames not found")
