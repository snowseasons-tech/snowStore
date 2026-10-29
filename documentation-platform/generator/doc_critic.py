from dataclasses import dataclass
from typing import List, Dict, Any, Tuple
import requests

@dataclass
class ValidationFinding:
    section: str
    issue: str
    severity: str # 'CRITICAL' (hallucination), 'WARNING' (style/missing), 'INFO'
    suggestion: str

class DocCritic:
    """
    The 'Critic' agent that adversarially reviews AI-generated drafts
    against the ground-truth technical context.
    """
    def __init__(self, api_url: str = "http://localhost:8080/v1", api_key: str = "no-key"):
        self.api_url = api_url
        self.api_key = api_key

    def validate_draft(self, draft_content: str, ground_truth: str) -> Tuple[List[ValidationFinding], bool]:
        """
        Reviews a draft for hallucinations and factual errors.
        Returns a list of findings and a boolean indicating if the draft is 'Approved'.
        """
        prompt = f"""
You are a strict Technical Auditor. Your job is to find FACTUAL ERRORS and HALLUCINATIONS in a documentation draft.

--- GROUND TRUTH ---
{ground_truth}

--- DOCUMENT DRAFT ---
{draft_content}

--- AUDIT INSTRUCTIONS ---
1. Compare every claim in the draft against the ground truth.
2. If the draft mentions a feature, endpoint, or capability NOT present in the ground truth, mark it as a CRITICAL hallucination.
3. If the draft contradicts the ground truth, mark it as CRITICAL.
4. If a section is vague or lacks detail that is present in the ground truth, mark it as a WARNING.
5. Be pedantic. If it's not in the truth, it's a hallucination.

OUTPUT FORMAT:
Provide your audit as a JSON list of objects:
[
  {{"section": "...", "issue": "...", "severity": "CRITICAL|WARNING|INFO", "suggestion": "..."}}
]
If no issues are found, return an empty list [].
"""
        try:
            response = requests.post(
                f"{self.api_url}/chat/completions",
                headers={"Authorization": f"Bearer {self.api_key}"},
                json={
                    "model": "gpt-3.5-turbo",
                    "messages": [
                        {"role": "system", "content": "You are a pedantic technical auditor. You output ONLY valid JSON arrays of findings."},
                        {"role": "user", "content": prompt}
                    ],
                    "temperature": 0.0 # Zero temperature for maximum consistency
                },
                timeout=60
            )
            response.raise_for_status()

            # Parse the JSON response
            import json
            findings_data = json.loads(response.json()['choices'][0]['message']['content'])

            findings = [ValidationFinding(**f) for f in findings_data]
            is_approved = not any(f.severity == 'CRITICAL' for f in findings)

            return findings, is_approved

        except Exception as e:
            print(f"Audit Error: {e}")
            # On error, we fail-safe to 'Not Approved' but provide no findings
            return [], False
