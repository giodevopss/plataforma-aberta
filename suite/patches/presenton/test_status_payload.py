"""Run with the official application's SQLModel/Pydantic dependencies."""
import ast
import json
import sys
import unittest
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, "/app/servers/fastapi")
from models.sql.async_task import AsyncTaskModel
from fastapi import HTTPException

class Session:
    def __init__(self, value):
        self.value = value
    async def get(self, *_):
        return self.value

def load_handler():
    tree = ast.parse(Path("/app/servers/fastapi/api/v1/ppt/endpoints/presentation.py").read_text())
    function = next(node for node in tree.body if isinstance(node, ast.AsyncFunctionDef) and node.name == "check_async_presentation_generation_status")
    function.decorator_list = []
    namespace = {
        "Request": object, "AsyncSession": object, "AsyncTaskModel": AsyncTaskModel,
        "Path": lambda **_: None, "Depends": lambda *_: None,
        "get_async_session": lambda: None, "HTTPException": HTTPException,
        "absolute_mcp_result_links": lambda request, data: {**data, "path": "http://127.0.0.1:12345" + data["path"]},
    }
    exec(compile(ast.Module(body=[function], type_ignores=[]), "presenton-status-handler", "exec"), namespace)
    return namespace[function.name]

class StatusResponseTests(unittest.IsolatedAsyncioTestCase):
    async def test_completed_export_is_json_and_does_not_mutate_database_object(self):
        original = {"path": "/app_data/qa.pptx", "presentation_id": str(uuid4())}
        task = AsyncTaskModel(id="qa-task", type="presentation.generate", status="completed", data=original)
        result = await load_handler()(object(), "qa-task", Session(task))
        self.assertIsInstance(result, dict)
        self.assertEqual(result["data"]["path"], "http://127.0.0.1:12345/app_data/qa.pptx")
        self.assertEqual(task.data, original)
        self.assertNotIn("owner_id", result)
        json.dumps(result)

    async def test_pending_and_unknown_tasks_keep_original_api_behavior(self):
        task = AsyncTaskModel(id="qa-pending", type="presentation.generate", status="pending", data=None)
        result = await load_handler()(object(), "qa-pending", Session(task))
        self.assertEqual(result["status"], "pending")
        self.assertIsNone(result["data"])
        with self.assertRaises(HTTPException) as raised:
            await load_handler()(object(), "unknown", Session(None))
        self.assertEqual(raised.exception.status_code, 404)

if __name__ == "__main__":
    unittest.main()
