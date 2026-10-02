"""Guard against replaying fixture writes when acceptance responses fail."""
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

spec = importlib.util.spec_from_file_location("runner", Path(__file__).with_name("validate_d1_local.py"))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class AcceptanceRequestTests(unittest.TestCase):
    def test_execution_is_never_retried(self):
        for outcome in ("success", "timeout", "json", "http"):
            with self.subTest(outcome=outcome):
                process = Mock()
                process.poll.return_value = None
                ready = HTTPError("ready", 404, "ready", {}, io.BytesIO(b'{"error":"NOT_FOUND"}'))
                response = Mock()
                response.status = 200
                response.__enter__ = Mock(return_value=response)
                response.__exit__ = Mock(return_value=False)
                response.read.return_value = b'{"ok":true,"checks":{}}' if outcome == "success" else b"invalid json"
                terminal = response
                if outcome == "timeout":
                    terminal = TimeoutError("suite timeout")
                elif outcome == "http":
                    terminal = HTTPError("suite", 500, "failure", {}, io.BytesIO(b'{"error":"TEST_FAILED"}'))
                with patch.object(runner, "urlopen", side_effect=[URLError("not started"), ready, terminal]) as opener, \
                     patch.object(runner.time, "sleep"), patch.object(runner, "worker_log", return_value=""):
                    if outcome == "success":
                        self.assertTrue(runner.wait_for_acceptance(1234, process, Path("unused.log"))["ok"])
                    else:
                        with self.assertRaises(RuntimeError):
                            runner.wait_for_acceptance(1234, process, Path("unused.log"))
                    self.assertEqual([call.args[0] for call in opener.call_args_list],
                                     ["http://127.0.0.1:1234/__d1_ready"] * 2 + ["http://127.0.0.1:1234/__d1_acceptance"])
                    self.assertEqual(opener.call_args_list[-1].kwargs["timeout"], 60)


if __name__ == "__main__":
    unittest.main()
