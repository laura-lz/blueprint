import json
import phoenix as px
import pandas as pd
from datetime import datetime
import os
import sys
import argparse
import nest_asyncio
from dotenv import load_dotenv

# Fix for nested asyncio in notebooks/scripts
nest_asyncio.apply()

# Define paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(BASE_DIR)

# Load environment variables from .env in project root
load_dotenv(os.path.join(PROJECT_ROOT, ".env"), override=True)

DEFAULT_CAPSULES_PATH = os.path.join(BASE_DIR, "../samples/calculator/public/capsules.json")


def load_data(capsules_path):
    """Loads capsules.json and converts it to a format suitable for Phoenix."""
    try:
        if not os.path.exists(capsules_path):
            print(f"Error: {capsules_path} not found. Please run the agent first.")
            return None

        with open(capsules_path, "r") as f:
            data = json.load(f)
        
        records = []
        for file_path, capsule in data.get("files", {}).items():
            # Check for upperLevelSummary (the AI-generated summary)
            if capsule.get("upperLevelSummary") or capsule.get("metadata"):
                metadata = capsule.get("metadata", {})
                record = {
                    "id": file_path,
                    "input": json.dumps({
                        "relativePath": capsule.get("relativePath"),
                        "lang": capsule.get("lang"),
                        "exports": [e.get("name") for e in capsule.get("exports", [])],
                        "functionSignatures": [s.get("signature") for s in metadata.get("functionSignatures", [])],
                        "firstNLines": metadata.get("firstNLines", "")[:500],
                    }, indent=2),
                    "output": capsule.get("upperLevelSummary", ""),
                    "language": capsule.get("lang"),
                    "name": capsule.get("name"),
                    "has_summary": bool(capsule.get("upperLevelSummary")),
                    "prompt_version": capsule.get("upperLevelSummaryVersion", "v1_balanced")
                }
                records.append(record)
        
        return pd.DataFrame(records)

    except Exception as e:
        print(f"Failed to load data: {e}")
        return None


def load_lower_level_data(capsules_path):
    """Loads lower-level (deep) analysis data from capsules.json."""
    try:
        if not os.path.exists(capsules_path):
            print(f"Error: {capsules_path} not found.")
            return None

        with open(capsules_path, "r") as f:
            data = json.load(f)
        
        records = []
        for file_path, capsule in data.get("files", {}).items():
            # Only include files that have lower-level analysis
            if capsule.get("lowerLevelSummary"):
                structure = capsule.get("structure", [])
                record = {
                    "id": file_path,
                    "input": json.dumps({
                        "relativePath": capsule.get("relativePath"),
                        "lang": capsule.get("lang"),
                        "exports": [e.get("name") for e in capsule.get("exports", [])],
                        "imports": [i.get("pathOrModule") for i in capsule.get("imports", [])],
                    }, indent=2),
                    "output": capsule.get("lowerLevelSummary", ""),
                    "language": capsule.get("lang"),
                    "name": capsule.get("name"),
                    "num_blocks": len(structure),
                    "structure_json": json.dumps(structure, indent=2) if structure else "",
                    "prompt_version": capsule.get("lowerLevelSummaryVersion", "v1_structured")
                }
                records.append(record)
        
        return pd.DataFrame(records)

    except Exception as e:
        print(f"Failed to load lower-level data: {e}")
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
        return None

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


def run_lower_level_evaluations(df):
    """Runs LLM-based evaluations on lower-level (deep) analysis data."""
    print("🧠 Running Lower-Level AI Evaluations...")
    
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("⚠️ GEMINI_API_KEY not set. Skipping lower-level evaluations.")
        return None

    model = LiteLLMModel(
        model="gemini/gemini-2.0-flash",
    )

    # 1. Detail Score (1-5) - Does it describe algorithms and implementation details?
    detail_template = ClassificationTemplate(
        rails=["1", "2", "3", "4", "5"],
        template="""
        You are an expert code documentation reviewer.
        Evaluate the DETAIL level of the following deep file analysis.
        
        File Metadata: {input}
        Deep Analysis Summary: {output}
        
        Rate the detail level on a scale of 1-5:
        1: Very shallow, no implementation details.
        3: Mentions some algorithms or patterns but lacks depth.
        5: Comprehensive, describes algorithms, data flow, and key implementation details.
        
        Provide a brief explanation for your score.
        """
    )
    
    # 2. Structure Accuracy (1-5) - Does the structure array seem plausible?
    # We pass the structure JSON as part of the input for this check
    accuracy_template = ClassificationTemplate(
        rails=["1", "2", "3", "4", "5"],
        template="""
        You are an expert code analyst.
        Evaluate whether the structure breakdown is ACCURATE for this file.
        
        File Metadata: {input}
        Deep Analysis Summary: {output}
        
        Rate the accuracy on a scale of 1-5:
        1: Structure is clearly wrong or nonsensical.
        3: Structure is mostly correct but has some issues.
        5: Structure accurately reflects the file's organization.
        
        Provide a brief explanation for your score.
        """
    )

    evaluators = [
        LLMEvaluator(model=model, template=detail_template),
        LLMEvaluator(model=model, template=accuracy_template)
    ]

    try:
        results = run_evals(
            dataframe=df,
            evaluators=evaluators,
            provide_explanation=True
        )
        print("✅ Lower-level evaluations complete!")
        return results
    except Exception as e:
        print(f"❌ Lower-level evaluation failed: {e}")
        return None

def main(args):
    capsules_path = args.capsules_path
    print("🚀 Starting Arize Phoenix for Nexhacks...")
    
    # 1. Load the data
    print(f"📂 Loading data from {capsules_path}...")
    df = load_data(capsules_path)
    
    if df is not None and not df.empty:
        print(f"✅ Loaded {len(df)} records.")
        
        # 2. Run Evaluations
        # Auto-run evaluations as requested
        eval_results = run_evaluations(df)
        
        if eval_results is not None:
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
            
            # Prompts used (comma separated)
            if "prompt_version" in df.columns:
                 history_record["prompt_versions"] = ",".join(df["prompt_version"].unique())
            
            # Append to history CSV
            history_df = pd.DataFrame([history_record])
            if not os.path.exists(history_file):
                history_df.to_csv(history_file, index=False)
            else:
                history_df.to_csv(history_file, mode='a', header=False, index=False)
            
            print(f"📈 Appended metrics to history log: {history_file}")
            
        # 3. Create Inferences Dataset w/ proper schema
        feature_cols = ["input"]
        tag_cols = ["language", "name", "has_summary", "prompt_version"]
        
        # Add eval columns only if they exist
        for col in ["clarity_score", "verbosity_is_good", "completeness_score"]:
            if col in df.columns:
                feature_cols.append(col)
        
        for col in ["clarity_explanation", "verbosity_label", "verbosity_explanation", "completeness_explanation"]:
            if col in df.columns:
                tag_cols.append(col)

        schema = px.Schema(
            prediction_id_column_name="id",
            response_column_names="output",
            feature_column_names=feature_cols,
            tag_column_names=tag_cols
        )

        ds_upper = px.Inferences(dataframe=df, schema=schema, name="Upper-Level Summaries")

        # =====================================================
        # LOWER-LEVEL ANALYSIS PROCESSING
        # =====================================================
        print("\n📂 Loading lower-level analysis data...")
        df_lower = load_lower_level_data(capsules_path)
        ds_lower = None
        
        if df_lower is not None and not df_lower.empty:
            print(f"✅ Loaded {len(df_lower)} lower-level records.")
            
            # Run lower-level evaluations
            lower_eval_results = run_lower_level_evaluations(df_lower)
            
            if lower_eval_results is not None:
                print(f"🔗 Merging {len(lower_eval_results)} lower-level evaluation result sets...")
                
                # 1. Detail Score Results (Index 0)
                if len(lower_eval_results) > 0:
                    detail_df = lower_eval_results[0]
                    detail_df = detail_df.rename(columns={
                        "label": "detail_score",
                        "explanation": "detail_explanation",
                    })
                    detail_df["detail_score"] = pd.to_numeric(detail_df["detail_score"], errors='coerce')
                    detail_df = detail_df[["detail_score", "detail_explanation"]]
                    df_lower = df_lower.join(detail_df)

                # 2. Accuracy Score Results (Index 1)
                if len(lower_eval_results) > 1:
                    accuracy_df = lower_eval_results[1]
                    accuracy_df = accuracy_df.rename(columns={
                        "label": "accuracy_score",
                        "explanation": "accuracy_explanation",
                    })
                    accuracy_df["accuracy_score"] = pd.to_numeric(accuracy_df["accuracy_score"], errors='coerce')
                    accuracy_df = accuracy_df[["accuracy_score", "accuracy_explanation"]]
                    df_lower = df_lower.join(accuracy_df)

                # Save lower-level results
                output_csv_lower = os.path.join(BASE_DIR, "evaluation_results_lower.csv")
                df_lower.to_csv(output_csv_lower, index=False)
                print(f"💾 Saved lower-level results to {output_csv_lower}")

                # SAVE LOWER-LEVEL HISTORICAL TRACKING (Append-Only Log)
                history_file_lower = os.path.join(BASE_DIR, "evaluation_history_lower.csv")
                
                history_record_lower = {
                    "timestamp": datetime.now().isoformat(),
                    "num_records": len(df_lower)
                }
                
                # Detail Mean
                if "detail_score" in df_lower.columns:
                    history_record_lower["detail_mean"] = round(df_lower["detail_score"].mean(), 2)
                
                # Accuracy Mean
                if "accuracy_score" in df_lower.columns:
                    history_record_lower["accuracy_mean"] = round(df_lower["accuracy_score"].mean(), 2)
                
                # Append to history CSV
                history_df_lower = pd.DataFrame([history_record_lower])
                if not os.path.exists(history_file_lower):
                    history_df_lower.to_csv(history_file_lower, index=False)
                else:
                    history_df_lower.to_csv(history_file_lower, mode='a', header=False, index=False)
                
                print(f"📈 Appended lower-level metrics to history log: {history_file_lower}")

            # Create lower-level Phoenix dataset
            feature_cols_lower = ["input", "num_blocks"]
            tag_cols_lower = ["language", "name", "structure_json", "prompt_version"]
            
            for col in ["detail_score", "accuracy_score"]:
                if col in df_lower.columns:
                    feature_cols_lower.append(col)
            
            for col in ["detail_explanation", "accuracy_explanation"]:
                if col in df_lower.columns:
                    tag_cols_lower.append(col)

            schema_lower = px.Schema(
                prediction_id_column_name="id",
                response_column_names="output",
                feature_column_names=feature_cols_lower,
                tag_column_names=tag_cols_lower
            )
            ds_lower = px.Inferences(dataframe=df_lower, schema=schema_lower, name="Lower-Level Analyses")
        else:
            print("⚠️ No lower-level analysis data found (run --deep-all first).")

        # 4. Launch Phoenix with both datasets (only if not headless)
        if not args.headless:
            if ds_lower:
                session = px.launch_app(primary=ds_upper, reference=ds_lower)
            else:
                session = px.launch_app(primary=ds_upper)
            
            print("\n✨ Phoenix is running!")
            print(f"👉 Open the UI: {session.url}")
            
            # Keep the script running
            input("\nPress Enter to stop the server...")
        else:
            print("\n✅ Evaluations complete (headless mode - CSVs saved).")
    else:
        print("⚠️ No data found to inspect.")
        if args.headless:
            sys.exit(1)


def parse_args():
    parser = argparse.ArgumentParser(description="Nexhacks Monitoring & Evaluation")
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run evaluations and save CSVs without launching Phoenix UI"
    )
    parser.add_argument(
        "--capsules-path",
        type=str,
        default=DEFAULT_CAPSULES_PATH,
        help="Path to capsules.json file"
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    main(args)

