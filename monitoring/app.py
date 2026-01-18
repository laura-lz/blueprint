import json
import phoenix as px
import pandas as pd
from datetime import datetime
import os
import nest_asyncio
# Fix for nested asyncio in notebooks/scripts
nest_asyncio.apply()

# Define dataset path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CAPSULES_PATH = os.path.join(BASE_DIR, "../public/capsules.json")


def load_data():
    """Loads capsules.json and converts it to a format suitable for Phoenix."""
    try:
        if not os.path.exists(CAPSULES_PATH):
            print(f"Error: {CAPSULES_PATH} not found. Please run the agent first.")
            return None

        with open(CAPSULES_PATH, "r") as f:
            data = json.load(f)
        
        records = []
        for file_path, capsule in data.get("files", {}).items():
            if capsule.get("summaryContext"):
                record = {
                    "id": file_path,
                    "input": json.dumps(capsule["summaryContext"], indent=2),
                    "output": capsule.get("summary", ""),
                    "language": capsule.get("lang"),
                    "name": capsule.get("name"),
                    "has_summary": bool(capsule.get("summary"))
                }
                records.append(record)
        
        return pd.DataFrame(records)

    except Exception as e:
        print(f"Failed to load data: {e}")
        return None

from phoenix.evals import (
    run_evals, 
    classify,
    RAG_RELEVANCY_PROMPT_TEMPLATE
)
from phoenix.evals.legacy import (
    LLMEvaluator,
    PromptTemplate,
    ClassificationTemplate
)
from phoenix.evals.models import LiteLLMModel

# ...

def run_evaluations(df):
    """Runs LLM-based evaluations on the data."""
    print("🧠 Running AI Evaluations...")
    
    # Configure Gemini model via LiteLLM
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("⚠️ GEMINI_API_KEY not set. Skipping evaluations.")
        return df

    # Use a Gemini model supported by LiteLLM
    model = LiteLLMModel(
        model="gemini/gemini-2.0-flash",
    )

    # 1. Clarity Evaluator (Score 1-5)
    # We use ClassificationTemplate because LLMEvaluator expects the template 
    # to support 'extract_label_from_explanation' for parsing results.
    clarity_template = ClassificationTemplate(
        rails=["1", "2", "3", "4", "5"],
        template="""
        You are an expert code documentation reviewer.
        Evaluate the clarity of the following code summary.
        
        Input Context: {input}
        Generated Summary: {output}
        
        Rate the clarity on a scale of 1-5:
        1: Completely unclear or irrelevant.
        5: Perfectly clear, concise, and accurate describing the code.
        
        Provide a brief explanation for your score.
        """
    )
    
    # 2. Verbosity Evaluator (Categorical)
    verbosity_template = ClassificationTemplate(
        rails=["Too Short", "Good", "Too Long"],
        template="""
        Evaluate the verbosity of the generated summary for the given code context.
        
        Input Context: {input}
        Generated Summary: {output}
        
        Classify as:
        - 'Too Short': Misses key details.
        - 'Good': Just right.
        - 'Too Long': Too wordy or redundant.
        """
    )

    # 3. Completeness Evaluator (Score 1-5)
    # Checks if the summary mentions key functions/classes found in the code.
    completeness_template = ClassificationTemplate(
        rails=["1", "2", "3", "4", "5"],
        template="""
        You are an expert code reviewer.
        Evaluate the completeness of the following code summary.
        
        Input Context: {input}
        Generated Summary: {output}
        
        Rate the completeness on a scale of 1-5:
        1: Misses the main purpose and key components.
        3: Covers the main purpose but misses some important details.
        5: Comprehensively covers the purpose, key functions, and behavior.
        
        Provide a brief explanation for your score.
        """
    )

    # Run evaluations
    # Using legacy LLMEvaluator which takes (model, template)
    # The order of results matches this list.
    evaluators = [
        LLMEvaluator(
            model=model,
            template=clarity_template
        ),
        LLMEvaluator(
            model=model,
            template=verbosity_template
        ),
        LLMEvaluator(
            model=model,
            template=completeness_template
        )
    ]

    try:
        results = run_evals(
            dataframe=df,
            evaluators=evaluators,
            provide_explanation=True
        )
        print("✅ Evaluations complete!")
        return results
    except Exception as e:
        print(f"❌ Evaluation failed: {e}")
        return None

def main():
    print("🚀 Starting Arize Phoenix for Nexhacks...")
    
    # 1. Load the data
    print(f"📂 Loading data from {CAPSULES_PATH}...")
    df = load_data()
    
    if df is not None and not df.empty:
        print(f"✅ Loaded {len(df)} records.")
        
        # 2. Run Evaluations
        # Auto-run evaluations as requested
        eval_results = run_evaluations(df)
        
        if eval_results:
            print(f"🔗 Merging {len(eval_results)} evaluation result sets...")
            
            # 1. Clarity Results (Index 0)
            if len(eval_results) > 0:
                clarity_df = eval_results[0]
                clarity_df = clarity_df.rename(columns={
                    "label": "clarity_score",
                    "explanation": "clarity_explanation",
                    "score": "clarity_numeric"
                })
                # Ensure score is numeric
                clarity_df["clarity_score"] = pd.to_numeric(clarity_df["clarity_score"], errors='coerce')
                clarity_df = clarity_df[["clarity_score", "clarity_explanation"]]
                df = df.join(clarity_df)

            # 2. Verbosity Results (Index 1)
            if len(eval_results) > 1:
                verbosity_df = eval_results[1]
                verbosity_df = verbosity_df.rename(columns={
                    "label": "verbosity_label",
                    "explanation": "verbosity_explanation",
                    "score": "verbosity_confidence"
                })
                # 1 = Good, 0 = Too Short/Too Long
                verbosity_df["verbosity_is_good"] = verbosity_df["verbosity_label"].apply(
                    lambda x: 1 if str(x).lower() == "good" else 0
                )
                verbosity_df = verbosity_df[["verbosity_label", "verbosity_explanation", "verbosity_is_good"]]
                df = df.join(verbosity_df)

            # 3. Completeness Results (Index 2)
            if len(eval_results) > 2:
                completeness_df = eval_results[2]
                completeness_df = completeness_df.rename(columns={
                    "label": "completeness_score",
                    "explanation": "completeness_explanation",
                    "score": "completeness_numeric"
                })
                # Ensure score is numeric
                completeness_df["completeness_score"] = pd.to_numeric(completeness_df["completeness_score"], errors='coerce')
                completeness_df = completeness_df[["completeness_score", "completeness_explanation"]]
                df = df.join(completeness_df)

            # SAVE RAW RESULTS LOCALLY
            output_csv = os.path.join(BASE_DIR, "evaluation_results.csv")
            df.to_csv(output_csv, index=False)
            print(f"💾 Saved raw results to {output_csv}")

            # SAVE SUMMARY STATS (Aggregate Report)
            print("📊 Generating summary statistics...")
            stats = []
            
            # Numeric Columns
            numeric_cols = ["clarity_score", "completeness_score", "verbosity_is_good"]
            for col in numeric_cols:
                if col in df.columns:
                    desc = df[col].describe()
                    stats.append({
                        "Feature": col,
                        "Type": "Numeric",
                        "Count": desc["count"],
                        "Mean": round(desc["mean"], 2),
                        "Min": desc["min"],
                        "Max": desc["max"],
                        "StdDev": round(desc["std"], 2),
                        "Top/Unique": "N/A"
                    })

            # Categorical Columns
            cat_cols = ["verbosity_label", "language", "name"]
            for col in cat_cols:
                if col in df.columns:
                    desc = df[col].astype(str).describe()
                    stats.append({
                        "Feature": col,
                        "Type": "Categorical",
                        "Count": desc["count"],
                        "Mean": "N/A",
                        "Min": "N/A",
                        "Max": "N/A",
                        "StdDev": "N/A",
                        "Top/Unique": f"{desc['top']} ({desc['freq']}/{desc['unique']})"
                    })
            
            stats_df = pd.DataFrame(stats)
            output_stats = os.path.join(BASE_DIR, "evaluation_stats.csv")
            stats_df.to_csv(output_stats, index=False)
            print(f"💾 Saved summary stats to {output_stats}")

            # SAVE HISTORICAL TRACKING (Append-Only Log)
            # We want a flat structure: Timestamp, Clarity_Mean, Verbosity_Good_Rate, etc.
            history_file = os.path.join(BASE_DIR, "evaluation_history.csv")
            
            # Extract key metrics safely
            history_record = {
                "timestamp": datetime.now().isoformat(),
                "num_records": len(df)
            }
            
            # Clarity Mean
            if "clarity_score" in df.columns:
                 history_record["clarity_mean"] = round(df["clarity_score"].mean(), 2)
            
            # Completeness Mean
            if "completeness_score" in df.columns:
                 history_record["completeness_mean"] = round(df["completeness_score"].mean(), 2)
            
            # Verbosity Pass Rate (Mean of 0/1 score)
            if "verbosity_is_good" in df.columns:
                 history_record["verbosity_pass_rate"] = round(df["verbosity_is_good"].mean(), 2)
            
            # Append to history CSV
            history_df = pd.DataFrame([history_record])
            if not os.path.exists(history_file):
                history_df.to_csv(history_file, index=False)
            else:
                history_df.to_csv(history_file, mode='a', header=False, index=False)
            
            print(f"📈 Appended metrics to history log: {history_file}")
            
        # 3. Create Inferences Dataset w/ proper schema
        # We define input -> Feature (since it's text, not embedding)
        # We add the new evaluation columns as tags so they show up in the UI
        # Note: Explanations are text, so they will always show as categorical/high-cardinality in aggregates.
        schema = px.Schema(
            prediction_id_column_name="id",
            response_column_names="output",
            feature_column_names=[
                "input",
                "clarity_score",
                "verbosity_is_good", 
                "completeness_score"
            ],
            tag_column_names=[
                "language", "name", "has_summary",
                "clarity_explanation",
                "verbosity_label", "verbosity_explanation",
                "completeness_explanation"
            ]
        )

        ds = px.Inferences(dataframe=df, schema=schema)

        # 4. Launch Phoenix
        session = px.launch_app(primary=ds)
        
        print("\n✨ Phoenix is running!")
        print(f"👉 Open the UI: {session.url}")
        
        # Keep the script running
        input("\nPress Enter to stop the server...")
    else:
        print("⚠️ No data found to inspect.")

if __name__ == "__main__":
    main()
