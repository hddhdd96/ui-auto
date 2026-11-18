"""테스트 결과서(Excel·PPT) 생성기.

하네스가 만든 report-data.json(실행 환경, 테스트별 결과, 실패 원인 분류, 스크린샷 증적)을 읽어
같은 실행 디렉터리에 test-report.xlsx와 test-report.pptx를 만든다.

사용법: python3 harness/report/make_reports.py artifacts/harness/<실행 ID>/report-data.json

Python을 쓴 이유: openpyxl과 python-pptx는 표·차트·이미지 삽입을 모두 지원하는 성숙한 라이브러리라서,
결과서에 스크린샷 증적과 차트를 넣는 일을 Node 라이브러리보다 적은 코드로 안정적으로 할 수 있다.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.chart import BarChart, Reference
from openpyxl.drawing.image import Image as XlImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image as PilImage
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import PP_ALIGN
from pptx.util import Emu, Inches, Pt

FONT = "맑은 고딕"
STATUS_LABEL = {"passed": "통과", "failed": "실패", "flaky": "재시도 후 통과", "notrun": "실행 안 됨"}
STATUS_COLOR = {"passed": "DEF7EC", "failed": "FDE8E8", "flaky": "FDF6B2", "notrun": "E4E7EB"}
CATEGORY_LABEL = {"product": "제품 결함", "test": "테스트 코드", "env": "환경", "unknown": "분류 불가"}
SUITE_LABEL = {
    "api": "REST API",
    "ui": "UI E2E",
    "negative": "네거티브 dataset",
    "defects": "결함 재현",
    "flaky-naive": "Flaky 개선 전",
    "flaky-stable": "Flaky 개선 후",
}
NAVY = "102A43"
# PPT의 화면 증적 슬라이드에 넣을 스크린샷 최대 개수. 전체 증적은 Excel '증적' 시트에 모두 들어간다.
MAX_PPT_SCREENSHOTS = 12


def suite_label(suite: str) -> str:
    return SUITE_LABEL.get(suite, suite)


def fmt_time(iso: str) -> str:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone().strftime("%Y-%m-%d %H:%M:%S")


def portal_mode_text(mode: dict) -> str:
    defects = [k for k, v in (mode.get("defects") or {}).items() if v]
    flaky = [k for k, v in (mode.get("flaky") or {}).items() if isinstance(v, dict) and v.get("enabled")]
    parts = []
    parts.append(f"결함 주입: {', '.join(defects)}" if defects else "결함 주입: 꺼짐")
    parts.append(f"Flaky 주입: {', '.join(flaky)}" if flaky else "Flaky 주입: 꺼짐")
    return " / ".join(parts)


def info_rows(data: dict) -> list[tuple[str, str]]:
    run, env, project = data["run"], data["environment"], data["project"]
    return [
        ("대상 포털", f"{env['name']} ({env['baseUrl']})"),
        ("프로젝트", f"{project['name']} ({project['id']})"),
        ("실행 계정", data["account"]),
        ("포털 모드", portal_mode_text(data["portalMode"])),
        ("실행 스위트", ", ".join(suite_label(s) for s in data["suites"])),
        ("시작 시각", fmt_time(run["startedAt"])),
        ("종료 시각", fmt_time(run["finishedAt"])),
        ("소요 시간", f"{run['durationSec']}초"),
        ("코드 버전", f"{run.get('gitBranch') or '-'} @ {run.get('gitCommit') or '-'}"),
        ("실행 ID", run["id"]),
    ]


def ordered_failures(data: dict) -> list[dict]:
    return [t for t in data["tests"] if t["status"] == "failed"]


def evidence_tests(data: dict) -> list[dict]:
    """스크린샷이 있는 테스트. 실패를 먼저 두고, 나머지는 실행 순서대로 둔다."""
    with_shots = [t for t in data["tests"] if t["screenshots"]]
    return [t for t in with_shots if t["status"] == "failed"] + [t for t in with_shots if t["status"] != "failed"]


# ---------------------------------------------------------------- Excel

THIN = Side(style="thin", color="BCCCDC")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
HEADER_FILL = PatternFill("solid", fgColor=NAVY)
HEADER_FONT = Font(name=FONT, bold=True, color="FFFFFF")
BODY_FONT = Font(name=FONT)
WRAP = Alignment(wrap_text=True, vertical="top")


def write_header(ws, row: int, headers: list[str]) -> None:
    for col, text in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=col, value=text)
        cell.fill, cell.font, cell.border = HEADER_FILL, HEADER_FONT, BORDER
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def write_row(ws, row: int, values: list, fill: str | None = None) -> None:
    for col, value in enumerate(values, start=1):
        cell = ws.cell(row=row, column=col, value=value)
        cell.font, cell.border, cell.alignment = BODY_FONT, BORDER, WRAP
        if fill:
            cell.fill = PatternFill("solid", fgColor=fill)


def fit_to_page_width(ws, landscape: bool = True) -> None:
    """인쇄하거나 PDF로 바꿀 때 시트가 한 페이지 너비에 들어가게 한다."""
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True


def set_widths(ws, widths: list[int]) -> None:
    for index, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(index)].width = width


def build_excel(data: dict, run_dir: Path) -> Path:
    wb = Workbook()
    summary = data["summary"]

    # 요약
    ws = wb.active
    ws.title = "요약"
    ws["A1"] = "테스트 결과서"
    ws["A1"].font = Font(name=FONT, bold=True, size=16)
    ws["A2"] = "Mock 클라우드 포털 자동화 테스트 실행 결과. 이 문서는 테스트 하네스가 자동으로 작성했습니다."
    ws["A2"].font = Font(name=FONT, color="52606D")
    row = 4
    write_header(ws, row, ["항목", "내용", "", "", "", ""])
    ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=6)
    for key, value in info_rows(data):
        row += 1
        write_row(ws, row, [key, value, "", "", "", ""])
        # 설명이 긴 값은 B~F를 합친 칸에 쓴다. 숫자 표는 좁은 열을 그대로 쓴다.
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=6)

    row += 2
    ws.cell(row=row, column=1, value="실행 결과").font = Font(name=FONT, bold=True, size=13)
    row += 1
    write_header(ws, row, ["전체", "통과", "실패", "재시도 후 통과", "실행 안 됨(Not Run)", "통과율(실행 기준)"])
    row += 1
    write_row(ws, row, [summary["total"], summary["passed"], summary["failed"], summary["flaky"], summary["notRun"], f"{summary['passRate']}%"])

    row += 2
    ws.cell(row=row, column=1, value="스위트별 결과").font = Font(name=FONT, bold=True, size=13)
    row += 1
    suite_header_row = row
    write_header(ws, row, ["스위트", "전체", "통과", "실패", "재시도 후 통과", "실행 안 됨"])
    for suite in data["bySuite"]:
        row += 1
        write_row(ws, row, [suite_label(suite["suite"]), suite["total"], suite["passed"], suite["failed"], suite["flaky"], suite["notRun"]])
    suite_last_row = row

    chart = BarChart()
    chart.type = "bar"
    chart.grouping = "stacked"
    chart.overlap = 100
    chart.title = "스위트별 결과"
    chart.y_axis.title = "테스트 수"
    chart.add_data(Reference(ws, min_col=3, max_col=4, min_row=suite_header_row, max_row=suite_last_row), titles_from_data=True)
    chart.set_categories(Reference(ws, min_col=1, min_row=suite_header_row + 1, max_row=suite_last_row))
    chart.series[0].graphicalProperties.solidFill = "31A354"
    chart.series[1].graphicalProperties.solidFill = "D64545"
    chart.height, chart.width = 7, 16
    ws.add_chart(chart, f"H{suite_header_row}")

    failures = ordered_failures(data)
    row += 2
    ws.cell(row=row, column=1, value="실패 원인 분류").font = Font(name=FONT, bold=True, size=13)
    row += 1
    write_header(ws, row, ["분류", "건수"])
    for category, label in CATEGORY_LABEL.items():
        row += 1
        write_row(ws, row, [label, sum(1 for t in failures if (t.get("triage") or {}).get("category") == category)])
    set_widths(ws, [24, 14, 12, 12, 16, 18])
    fit_to_page_width(ws, landscape=False)

    # 테스트 결과
    ws = wb.create_sheet("테스트 결과")
    write_header(ws, 1, ["No", "TC ID", "테스트 이름", "스위트", "결과", "소요(초)", "실패 원인 분류", "오류 메시지", "증적"])
    for index, test in enumerate(data["tests"], start=1):
        triage = test.get("triage") or {}
        write_row(
            ws,
            index + 1,
            [
                index,
                test["tcId"],
                test["title"],
                suite_label(test["suite"]),
                STATUS_LABEL[test["status"]],
                round(test["durationMs"] / 1000, 1),
                CATEGORY_LABEL.get(triage.get("category"), "") if triage else "",
                test["error"] or "",
                f"스크린샷 {len(test['screenshots'])}장" if test["screenshots"] else "",
            ],
        )
        ws.cell(row=index + 1, column=5).fill = PatternFill("solid", fgColor=STATUS_COLOR[test["status"]])
    ws.freeze_panes = "C2"
    ws.auto_filter.ref = f"A1:I{len(data['tests']) + 1}"
    set_widths(ws, [6, 18, 60, 16, 14, 10, 14, 60, 14])
    fit_to_page_width(ws)

    # 실패 분석
    ws = wb.create_sheet("실패 분석")
    write_header(ws, 1, ["TC ID", "테스트 이름", "스위트", "분류", "규칙", "신뢰도", "판정 근거", "증적 내용"])
    if not failures:
        write_row(ws, 2, ["실패한 테스트가 없습니다.", "", "", "", "", "", "", ""])
    for index, test in enumerate(failures, start=2):
        triage = test.get("triage") or {}
        write_row(
            ws,
            index,
            [
                test["tcId"],
                test["title"],
                suite_label(test["suite"]),
                CATEGORY_LABEL.get(triage.get("category"), "분류 안 됨"),
                triage.get("ruleId") or "-",
                {"high": "높음", "low": "낮음"}.get(triage.get("confidence"), "-"),
                triage.get("reason", ""),
                "\n".join(triage.get("evidence", [])),
            ],
            fill="FDE8E8",
        )
    ws.freeze_panes = "B2"
    set_widths(ws, [18, 45, 16, 12, 24, 8, 40, 80])
    fit_to_page_width(ws)

    # 증적: 스크린샷을 셀 위에 붙인다. 이미지는 너비 640px로 줄인다.
    ws = wb.create_sheet("증적")
    ws["A1"] = "화면 증적(스크린샷). 실패한 테스트를 먼저 두고, 나머지는 실행 순서대로 두었습니다."
    ws["A1"].font = Font(name=FONT, bold=True)
    ws.column_dimensions["A"].width = 100
    row = 3
    for test in evidence_tests(data):
        for shot in test["screenshots"]:
            path = run_dir / shot
            if not path.exists():
                continue
            caption = ws.cell(row=row, column=1, value=f"{test['tcId']} [{STATUS_LABEL[test['status']]}] {test['title']}")
            caption.font = Font(name=FONT, bold=True, color="9B1C1C" if test["status"] == "failed" else "1F2933")
            image = XlImage(str(path))
            ratio = 640 / image.width
            image.width, image.height = 640, int(image.height * ratio)
            ws.add_image(image, f"A{row + 1}")
            # 기본 행 높이(20px) 기준으로 이미지가 차지하는 행 수만큼 건너뛴다.
            row += 2 + image.height // 20 + 1

    out = run_dir / "test-report.xlsx"
    wb.save(out)
    return out


# ---------------------------------------------------------------- PPT

SLIDE_W, SLIDE_H = Inches(13.333), Inches(7.5)


def style_runs(text_frame, size: int, bold: bool = False, color: str = "1F2933") -> None:
    for paragraph in text_frame.paragraphs:
        for run in paragraph.runs:
            run.font.name, run.font.size, run.font.bold = FONT, Pt(size), bold
            run.font.color.rgb = RGBColor.from_string(color)


def add_text(slide, left, top, width, height, text: str, size: int = 14, bold: bool = False, color: str = "1F2933", align=None):
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.word_wrap = True
    lines = text.split("\n")
    frame.text = lines[0]
    for line in lines[1:]:
        frame.add_paragraph().text = line
    style_runs(frame, size, bold, color)
    if align is not None:
        for paragraph in frame.paragraphs:
            paragraph.alignment = align
    return box


def add_title(slide, title: str, subtitle: str | None = None) -> None:
    bar = slide.shapes.add_shape(1, 0, 0, SLIDE_W, Inches(0.12))
    bar.fill.solid()
    bar.fill.fore_color.rgb = RGBColor.from_string(NAVY)
    bar.line.fill.background()
    add_text(slide, Inches(0.5), Inches(0.3), Inches(12.3), Inches(0.7), title, size=26, bold=True, color=NAVY)
    if subtitle:
        add_text(slide, Inches(0.5), Inches(0.95), Inches(12.3), Inches(0.5), subtitle, size=13, color="52606D")


def add_table(slide, left, top, width, rows: list[list[str]], col_widths: list[float], font_size: int = 11, row_height=Inches(0.36), fills: list[str | None] | None = None):
    shape = slide.shapes.add_table(len(rows), len(rows[0]), left, top, width, row_height * len(rows))
    table = shape.table
    for index, col_width in enumerate(col_widths):
        table.columns[index].width = Inches(col_width)
    for r, values in enumerate(rows):
        for c, value in enumerate(values):
            cell = table.cell(r, c)
            cell.text = str(value)
            style_runs(cell.text_frame, font_size, bold=(r == 0), color="FFFFFF" if r == 0 else "1F2933")
            cell.fill.solid()
            if r == 0:
                cell.fill.fore_color.rgb = RGBColor.from_string(NAVY)
            else:
                fill = fills[r - 1] if fills else None
                cell.fill.fore_color.rgb = RGBColor.from_string(fill or ("FFFFFF" if r % 2 else "F0F4F8"))
    return table


def add_picture_fit(slide, path: Path, left, top, max_w, max_h):
    with PilImage.open(path) as image:
        w, h = image.size
    scale = min(max_w / w, max_h / h)
    width, height = int(w * scale), int(h * scale)
    return slide.shapes.add_picture(str(path), left + (max_w - width) // 2, top, Emu(width), Emu(height))


def build_ppt(data: dict, run_dir: Path) -> Path:
    prs = Presentation()
    prs.slide_width, prs.slide_height = SLIDE_W, SLIDE_H
    blank = prs.slide_layouts[6]
    summary, env, project = data["summary"], data["environment"], data["project"]
    failures = ordered_failures(data)

    # 1. 표지
    slide = prs.slides.add_slide(blank)
    band = slide.shapes.add_shape(1, 0, Inches(2.4), SLIDE_W, Inches(2.4))
    band.fill.solid()
    band.fill.fore_color.rgb = RGBColor.from_string(NAVY)
    band.line.fill.background()
    add_text(slide, Inches(0.8), Inches(2.7), Inches(11.7), Inches(1), "테스트 결과서", size=40, bold=True, color="FFFFFF")
    add_text(slide, Inches(0.8), Inches(3.7), Inches(11.7), Inches(0.8), f"{env['name']} · {project['name']} · {fmt_time(data['run']['startedAt'])}", size=18, color="D9E2EC")
    add_text(slide, Inches(0.8), Inches(5.3), Inches(11.7), Inches(0.8), "테스트 하네스가 실행 결과와 스크린샷 증적으로 자동 작성한 문서입니다.", size=14, color="52606D")

    # 2. 실행 환경과 요약
    slide = prs.slides.add_slide(blank)
    add_title(slide, "실행 환경과 결과 요약")
    add_table(slide, Inches(0.5), Inches(1.5), Inches(6.6), [["항목", "내용"], *[[k, v] for k, v in info_rows(data)]], [1.6, 5.0], font_size=11)
    cards = [
        ("전체", summary["total"], "1F2933"),
        ("통과", summary["passed"], "03543F"),
        ("실패", summary["failed"], "9B1C1C"),
        ("실행 안 됨", summary["notRun"], "52606D"),
    ]
    for index, (label, value, color) in enumerate(cards):
        left = Inches(7.5 + (index % 2) * 2.75)
        top = Inches(1.5 + (index // 2) * 1.45)
        card = slide.shapes.add_shape(1, left, top, Inches(2.55), Inches(1.25))
        card.fill.solid()
        card.fill.fore_color.rgb = RGBColor.from_string("F0F4F8")
        card.line.color.rgb = RGBColor.from_string("D9E2EC")
        add_text(slide, left, top + Inches(0.08), Inches(2.55), Inches(0.4), label, size=13, color="52606D", align=PP_ALIGN.CENTER)
        add_text(slide, left, top + Inches(0.42), Inches(2.55), Inches(0.7), str(value), size=30, bold=True, color=color, align=PP_ALIGN.CENTER)
    add_text(slide, Inches(7.5), Inches(4.5), Inches(5.3), Inches(0.5), f"통과율(실행된 테스트 기준): {summary['passRate']}%", size=18, bold=True, color=NAVY)
    if summary["flaky"]:
        add_text(slide, Inches(7.5), Inches(5.0), Inches(5.3), Inches(0.5), f"재시도 후 통과: {summary['flaky']}건", size=13, color="723B13")

    # 3. 스위트별 결과
    slide = prs.slides.add_slide(blank)
    add_title(slide, "스위트별 결과", "테스트 종류(스위트)마다 통과·실패·실행 안 됨 건수")
    rows = [["스위트", "전체", "통과", "실패", "재시도 후 통과", "실행 안 됨"]]
    rows += [[suite_label(s["suite"]), s["total"], s["passed"], s["failed"], s["flaky"], s["notRun"]] for s in data["bySuite"]]
    add_table(slide, Inches(0.5), Inches(1.6), Inches(6.2), rows, [2.0, 0.8, 0.8, 0.8, 1.0, 0.8], font_size=12, row_height=Inches(0.45))
    chart_data = CategoryChartData()
    chart_data.categories = [suite_label(s["suite"]) for s in data["bySuite"]]
    chart_data.add_series("통과", [s["passed"] for s in data["bySuite"]])
    chart_data.add_series("실패", [s["failed"] for s in data["bySuite"]])
    chart = slide.shapes.add_chart(XL_CHART_TYPE.BAR_STACKED, Inches(7.0), Inches(1.5), Inches(5.9), Inches(5.3), chart_data).chart
    chart.has_legend = True
    chart.legend.position = XL_LEGEND_POSITION.BOTTOM
    chart.legend.include_in_layout = False
    chart.legend.font.name, chart.legend.font.size = FONT, Pt(11)
    chart.category_axis.tick_labels.font.name = FONT
    chart.category_axis.tick_labels.font.size = Pt(11)
    chart.value_axis.tick_labels.font.size = Pt(10)
    for series, color in zip(chart.plots[0].series, ["31A354", "D64545"]):
        series.format.fill.solid()
        series.format.fill.fore_color.rgb = RGBColor.from_string(color)

    # 4. 실패 원인 분류
    slide = prs.slides.add_slide(blank)
    counts = {c: sum(1 for t in failures if (t.get("triage") or {}).get("category") == c) for c in CATEGORY_LABEL}
    add_title(slide, "실패 원인 분류", " · ".join(f"{label} {counts[c]}건" for c, label in CATEGORY_LABEL.items()))
    if not failures:
        add_text(slide, Inches(0.5), Inches(1.8), Inches(12), Inches(1), "실패한 테스트가 없습니다.", size=20, color="03543F")
    else:
        rows = [["TC ID", "스위트", "분류", "판정 근거"]]
        rows += [[t["tcId"], suite_label(t["suite"]), CATEGORY_LABEL.get((t.get("triage") or {}).get("category"), "-"), (t.get("triage") or {}).get("reason", "")] for t in failures[:12]]
        add_table(slide, Inches(0.5), Inches(1.6), Inches(12.3), rows, [2.2, 2.0, 1.6, 6.5], font_size=11, row_height=Inches(0.4))
        if len(failures) > 12:
            add_text(slide, Inches(0.5), Inches(6.9), Inches(12), Inches(0.4), f"외 {len(failures) - 12}건은 Excel '실패 분석' 시트에 있습니다.", size=11, color="52606D")

    # 5. 실패 상세: 실패 한 건당 한 장(판정 근거 + 스크린샷)
    for test in failures:
        triage = test.get("triage") or {}
        slide = prs.slides.add_slide(blank)
        add_title(slide, f"실패 상세: {test['tcId']}", f"{suite_label(test['suite'])} · {test['title']}")
        detail = [
            f"분류: {CATEGORY_LABEL.get(triage.get('category'), '분류 안 됨')} ({triage.get('ruleId') or '-'}, 신뢰도 {({'high': '높음', 'low': '낮음'}).get(triage.get('confidence'), '-')})",
            f"판정 근거: {triage.get('reason', '-')}",
            "",
            "증적:",
            *[f"• {line}" for line in triage.get("evidence", [])][:6],
        ]
        has_shot = bool(test["screenshots"]) and (run_dir / test["screenshots"][0]).exists()
        add_text(slide, Inches(0.5), Inches(1.6), Inches(5.6 if has_shot else 12.3), Inches(5.5), "\n".join(detail), size=12)
        if has_shot:
            add_picture_fit(slide, run_dir / test["screenshots"][0], Inches(6.4), Inches(1.6), Inches(6.5), Inches(5.4))

    # 6. 화면 증적: 한 장에 4개(2×2)
    shots = [(t, s) for t in evidence_tests(data) if t["status"] != "failed" for s in t["screenshots"][:1] if (run_dir / s).exists()]
    shown = shots[:MAX_PPT_SCREENSHOTS]
    for page in range(0, len(shown), 4):
        slide = prs.slides.add_slide(blank)
        add_title(slide, "화면 증적", f"UI 테스트 마지막 화면 {page + 1}~{min(page + 4, len(shown))} / {len(shots)}장" + (" (나머지는 Excel '증적' 시트)" if len(shots) > len(shown) else ""))
        for index, (test, shot) in enumerate(shown[page:page + 4]):
            left = Inches(0.5 + (index % 2) * 6.25)
            top = Inches(1.5 + (index // 2) * 2.95)
            add_picture_fit(slide, run_dir / shot, left, top, Inches(6.0), Inches(2.45))
            add_text(slide, left, top + Inches(2.45), Inches(6.0), Inches(0.4), f"{test['tcId']} [{STATUS_LABEL[test['status']]}] {test['title']}", size=10, color="1F2933")

    out = run_dir / "test-report.pptx"
    prs.save(out)
    return out


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("사용법: python3 harness/report/make_reports.py <report-data.json>")
    data_file = Path(sys.argv[1]).resolve()
    data = json.loads(data_file.read_text(encoding="utf-8"))
    run_dir = data_file.parent
    excel = build_excel(data, run_dir)
    ppt = build_ppt(data, run_dir)
    print(f"Excel 결과서: {excel}")
    print(f"PPT 결과서: {ppt}")


if __name__ == "__main__":
    main()
