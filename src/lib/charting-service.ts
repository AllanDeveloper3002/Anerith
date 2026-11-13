import { all, newId, nowIso, one, run, withTransaction } from "./db";
import { ApiError } from "./errors";
import {
  DEFAULT_CHART_SETTINGS,
  parseChartDrawings,
  parseChartSettings,
  parseIndicators,
  parseDrawingStyle,
  defaultIndicators,
  type ChartDrawing,
  type ChartSettings,
  type IndicatorInstance,
} from "./charting";

export interface ChartLayoutRow {
  id: string;
  user_id: string;
  name: string;
  symbol: string | null;
  timeframe: string;
  indicators_json: string;
  chart_settings_json: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface ChartDrawingRow {
  id: string;
  user_id: string;
  layout_id: string;
  symbol: string;
  tool: string;
  points_json: string;
  style_json: string;
  visible: number;
  created_at: string;
  updated_at: string;
}

export interface IndicatorTemplateRow {
  id: string;
  user_id: string;
  name: string;
  indicators_json: string;
  created_at: string;
}

export interface ChartLayoutDTO {
  id: string;
  name: string;
  symbol: string | null;
  timeframe: string;
  indicators: IndicatorInstance[];
  chartSettings: ChartSettings;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IndicatorTemplateDTO {
  id: string;
  name: string;
  indicators: IndicatorInstance[];
  createdAt: string;
}

export interface ChartWorkspaceDTO {
  layoutId: string;
  layouts: ChartLayoutDTO[];
  templates: IndicatorTemplateDTO[];
  drawings: ChartDrawing[];
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toLayoutDTO(row: ChartLayoutRow): ChartLayoutDTO {
  return {
    id: row.id,
    name: row.name,
    symbol: row.symbol,
    timeframe: row.timeframe,
    indicators: parseIndicators(parseJson<unknown>(row.indicators_json, [])),
    chartSettings: parseChartSettings(parseJson<unknown>(row.chart_settings_json, {})),
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTemplateDTO(row: IndicatorTemplateRow): IndicatorTemplateDTO {
  return {
    id: row.id,
    name: row.name,
    indicators: parseIndicators(parseJson<unknown>(row.indicators_json, [])),
    createdAt: row.created_at,
  };
}

export function toDrawingDTO(row: ChartDrawingRow): ChartDrawing {
  const points = parseChartDrawings([
    { id: row.id, tool: row.tool, points: parseJson<unknown>(row.points_json, []), style: parseJson<unknown>(row.style_json, {}), visible: row.visible === 1 },
  ])[0];
  return points ?? { id: row.id, tool: "trendline", points: [], style: parseDrawingStyle({}), visible: false };
}

function createLayoutRow(
  userId: string,
  input: { name: string; symbol?: string | null; timeframe: string; indicators: IndicatorInstance[]; chartSettings: ChartSettings; isDefault?: boolean },
): ChartLayoutRow {
  const now = nowIso();
  const row: ChartLayoutRow = {
    id: newId(),
    user_id: userId,
    name: input.name,
    symbol: input.symbol ?? null,
    timeframe: input.timeframe,
    indicators_json: JSON.stringify(input.indicators),
    chart_settings_json: JSON.stringify(input.chartSettings),
    is_default: input.isDefault ? 1 : 0,
    created_at: now,
    updated_at: now,
  };
  run(
    `INSERT INTO user_chart_layouts
       (id, user_id, name, symbol, timeframe, indicators_json, chart_settings_json, is_default, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [row.id, row.user_id, row.name, row.symbol, row.timeframe, row.indicators_json, row.chart_settings_json, row.is_default, row.created_at, row.updated_at],
  );
  return row;
}

export function ensureDefaultLayout(userId: string): ChartLayoutRow {
  const existing = one<ChartLayoutRow>(
    "SELECT * FROM user_chart_layouts WHERE user_id = ? AND is_default = 1 ORDER BY created_at ASC LIMIT 1",
    [userId],
  );
  if (existing) return existing;
  const anyLayout = one<ChartLayoutRow>(
    "SELECT * FROM user_chart_layouts WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
    [userId],
  );
  if (anyLayout) {
    run("UPDATE user_chart_layouts SET is_default = 1, updated_at = ? WHERE id = ?", [nowIso(), anyLayout.id]);
    return { ...anyLayout, is_default: 1 };
  }
  return createLayoutRow(userId, {
    name: "My workspace",
    timeframe: "1m",
    indicators: defaultIndicators(),
    chartSettings: { ...DEFAULT_CHART_SETTINGS },
    isDefault: true,
  });
}

export function getChartWorkspace(userId: string, symbol: string, layoutId?: string | null): ChartWorkspaceDTO {
  const fallback = ensureDefaultLayout(userId);
  let layout = fallback;
  if (layoutId) {
    const owned = one<ChartLayoutRow>("SELECT * FROM user_chart_layouts WHERE id = ? AND user_id = ?", [layoutId, userId]);
    if (!owned) throw new ApiError(404, "Chart layout not found.");
    layout = owned;
  }
  const layouts = all<ChartLayoutRow>(
    "SELECT * FROM user_chart_layouts WHERE user_id = ? ORDER BY is_default DESC, updated_at DESC",
    [userId],
  ).map(toLayoutDTO);
  const templates = all<IndicatorTemplateRow>(
    "SELECT * FROM user_indicator_templates WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
  ).map(toTemplateDTO);
  const drawingRows = all<ChartDrawingRow>(
    "SELECT * FROM user_chart_drawings WHERE user_id = ? AND layout_id = ? AND symbol = ? ORDER BY created_at ASC",
    [userId, layout.id, symbol],
  );
  return {
    layoutId: layout.id,
    layouts,
    templates,
    drawings: drawingRows.map(toDrawingDTO).filter((drawing) => drawing.points.length > 0),
  };
}

export interface SaveChartInput {
  action: "save";
  layoutId: string;
  symbol: string;
  timeframe: string;
  indicators: IndicatorInstance[];
  chartSettings: ChartSettings;
  drawings: ChartDrawing[];
}

export interface CreateLayoutInput {
  action: "layout.create";
  name: string;
  symbol?: string | null;
  timeframe: string;
  indicators: IndicatorInstance[];
  chartSettings: ChartSettings;
  drawings: ChartDrawing[];
}

export interface DeleteLayoutInput {
  action: "layout.delete";
  layoutId: string;
}

export interface SaveTemplateInput {
  action: "template.save";
  name: string;
  indicators: IndicatorInstance[];
}

export interface DeleteTemplateInput {
  action: "template.delete";
  templateId: string;
}

export type ChartActionInput =
  | SaveChartInput
  | CreateLayoutInput
  | DeleteLayoutInput
  | SaveTemplateInput
  | DeleteTemplateInput;

function replaceDrawings(userId: string, layoutId: string, symbol: string, drawings: ChartDrawing[]): void {
  run("DELETE FROM user_chart_drawings WHERE user_id = ? AND layout_id = ? AND symbol = ?", [userId, layoutId, symbol]);
  const now = nowIso();
  for (const drawing of drawings) {
    run(
      `INSERT INTO user_chart_drawings
         (id, user_id, layout_id, symbol, tool, points_json, style_json, visible, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        userId,
        layoutId,
        symbol,
        drawing.tool,
        JSON.stringify(drawing.points),
        JSON.stringify(drawing.style),
        drawing.visible ? 1 : 0,
        now,
        now,
      ],
    );
  }
}

export function applyChartAction(userId: string, input: ChartActionInput): ChartWorkspaceDTO | ChartLayoutDTO | IndicatorTemplateDTO | { deleted: true } {
  switch (input.action) {
    case "save": {
      const layout = one<ChartLayoutRow>("SELECT * FROM user_chart_layouts WHERE id = ? AND user_id = ?", [input.layoutId, userId]);
      if (!layout) throw new ApiError(404, "Chart layout not found.");
      const now = nowIso();
      withTransaction(() => {
        run(
          "UPDATE user_chart_layouts SET symbol = ?, timeframe = ?, indicators_json = ?, chart_settings_json = ?, updated_at = ? WHERE id = ? AND user_id = ?",
          [input.symbol, input.timeframe, JSON.stringify(input.indicators), JSON.stringify(input.chartSettings), now, layout.id, userId],
        );
        replaceDrawings(userId, layout.id, input.symbol, input.drawings);
      });
      return getChartWorkspace(userId, input.symbol, layout.id);
    }
    case "layout.create": {
      const duplicate = one<{ id: string }>("SELECT id FROM user_chart_layouts WHERE user_id = ? AND name = ?", [userId, input.name]);
      if (duplicate) throw new ApiError(409, "A layout with that name already exists.");
      const layout = createLayoutRow(userId, {
        name: input.name,
        symbol: input.symbol ?? null,
        timeframe: input.timeframe,
        indicators: input.indicators,
        chartSettings: input.chartSettings,
      });
      if (input.drawings.length > 0 && input.symbol) {
        withTransaction(() => replaceDrawings(userId, layout.id, input.symbol as string, input.drawings));
      }
      return toLayoutDTO(layout);
    }
    case "layout.delete": {
      const owned = one<ChartLayoutRow>("SELECT * FROM user_chart_layouts WHERE id = ? AND user_id = ?", [input.layoutId, userId]);
      if (!owned) throw new ApiError(404, "Chart layout not found.");
      const count = one<{ total: number }>("SELECT COUNT(*) AS total FROM user_chart_layouts WHERE user_id = ?", [userId]);
      if ((count?.total ?? 0) <= 1) throw new ApiError(400, "Keep at least one chart layout.");
      withTransaction(() => {
        run("DELETE FROM user_chart_layouts WHERE id = ? AND user_id = ?", [input.layoutId, userId]);
        if (owned.is_default === 1) {
          const next = one<{ id: string }>("SELECT id FROM user_chart_layouts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1", [userId]);
          if (next) run("UPDATE user_chart_layouts SET is_default = 1, updated_at = ? WHERE id = ?", [nowIso(), next.id]);
        }
      });
      return { deleted: true };
    }
    case "template.save": {
      const existing = one<IndicatorTemplateRow>(
        "SELECT * FROM user_indicator_templates WHERE user_id = ? AND name = ?",
        [userId, input.name],
      );
      const now = nowIso();
      if (existing) {
        run(
          "UPDATE user_indicator_templates SET indicators_json = ?, created_at = ? WHERE id = ? AND user_id = ?",
          [JSON.stringify(input.indicators), now, existing.id, userId],
        );
        return toTemplateDTO({ ...existing, indicators_json: JSON.stringify(input.indicators), created_at: now });
      }
      const row: IndicatorTemplateRow = {
        id: newId(),
        user_id: userId,
        name: input.name,
        indicators_json: JSON.stringify(input.indicators),
        created_at: now,
      };
      run(
        "INSERT INTO user_indicator_templates (id, user_id, name, indicators_json, created_at) VALUES (?, ?, ?, ?, ?)",
        [row.id, row.user_id, row.name, row.indicators_json, row.created_at],
      );
      return toTemplateDTO(row);
    }
    case "template.delete": {
      const owned = one<{ id: string }>("SELECT id FROM user_indicator_templates WHERE id = ? AND user_id = ?", [input.templateId, userId]);
      if (!owned) throw new ApiError(404, "Indicator template not found.");
      run("DELETE FROM user_indicator_templates WHERE id = ? AND user_id = ?", [input.templateId, userId]);
      return { deleted: true };
    }
    default:
      throw new ApiError(400, "Unsupported chart action.");
  }
}
