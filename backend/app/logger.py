"""日志工具：统一输出到文件 + 控制台。"""
from datetime import datetime

LOG_FILE = "backend_debug.log"
_log_file = open(LOG_FILE, "a", encoding="utf-8")


def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    line = f"[{ts}] {msg}\n"
    _log_file.write(line)
    _log_file.flush()
    print(msg)


log(f"========== Backend logger initialized at {datetime.now()} ==========")
