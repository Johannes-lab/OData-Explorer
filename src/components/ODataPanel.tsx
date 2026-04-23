/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

import { useActiveIModelConnection, useActiveViewport } from "@itwin/appui-react";
import { Id64 } from "@itwin/core-bentley";
import { IModelApp } from "@itwin/core-frontend";
import { MappingsClient } from "@itwin/grouping-mapping-widget";
import {
  ODataClient,
  ReportsClient,
  type ODataEntityValue,
  type ODataItem,
  type ODataTable,
} from "@itwin/insights-client";
import { selectionStorage } from "../selectionStorage";
import { useEffect, useState } from "react";

const mappingsClient = new MappingsClient();
const reportsClient = new ReportsClient();
const odataClient = new ODataClient();

interface MappingOption {
  id: string;
  name: string;
}

const SELECTION_SOURCE = "ODataPanel";
const ELEMENT_ID_FIELD_CANDIDATES = [
  "ECInstanceId",
  "ecinstanceid",
  "ElementId",
  "elementid",
  "ECInstance ID",
  "Element ID",
  "Id",
  "id",
] as const;

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? "");
  const escaped = text.replaceAll("\"", "\"\"");
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}

function sanitizeFileNamePart(value: string): string {
  return value.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "odata-report";
}

function findElementIdField(columns: string[], rows: ODataEntityValue[]): string | undefined {
  for (const candidate of ELEMENT_ID_FIELD_CANDIDATES) {
    if (!columns.includes(candidate)) {
      continue;
    }

    const hasValidValue = rows.some((row) => {
      const value = row[candidate];
      return typeof value === "string" && Id64.isValidId64(value);
    });

    if (hasValidValue) {
      return candidate;
    }
  }

  return columns.find((column) =>
    rows.some((row) => typeof row[column] === "string" && Id64.isValidId64(row[column] as string)),
  );
}

function getRowElementId(row: ODataEntityValue, elementIdField: string | undefined): string | undefined {
  if (!elementIdField) {
    return undefined;
  }

  const value = row[elementIdField];
  return typeof value === "string" && Id64.isValidId64(value) ? value : undefined;
}

async function getAccessToken(): Promise<string> {
  const authClient = IModelApp.authorizationClient;
  if (!authClient) {
    throw new Error("Authorization client is not available.");
  }

  return authClient.getAccessToken();
}

export function ODataPanel() {
  const iModel = useActiveIModelConnection();
  const activeViewport = useActiveViewport();

  const [mappings, setMappings] = useState<MappingOption[]>([]);
  const [selectedMappingId, setSelectedMappingId] = useState("");
  const [selectedReportId, setSelectedReportId] = useState("");
  const [odataItems, setOdataItems] = useState<ODataItem[]>([]);
  const [tables, setTables] = useState<ODataTable[]>([]);
  const [selectedItemUrl, setSelectedItemUrl] = useState("");
  const [entities, setEntities] = useState<ODataEntityValue[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elementIdField = findElementIdField(columns, entities);
  const selectableElementIds = entities.flatMap((row) => {
    const rowElementId = getRowElementId(row, elementIdField);
    return rowElementId ? [rowElementId] : [];
  });
  const allSelectableRowsSelected = selectableElementIds.length > 0 && selectableElementIds.every((id) => selectedElementIds.includes(id));
  const exportRows = entities.filter((row) => {
    const rowElementId = getRowElementId(row, elementIdField);
    return rowElementId ? selectedElementIds.includes(rowElementId) : false;
  });

  // Fetch mappings when iModel changes
  useEffect(() => {
    const iModelId = iModel?.iModelId;
    if (!iModelId) return;

    let cancelled = false;
    setMappings([]);
    setSelectedMappingId("");
    setSelectedReportId("");

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const accessToken = await getAccessToken();
        const result = await mappingsClient.getMappings(accessToken, iModelId);
        if (!cancelled) {
          setMappings(result.mappings.map((m) => ({ id: m.id, name: m.mappingName })));
        }
      } catch {
        if (!cancelled) setError("Failed to load mappings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [iModel?.iModelId]);

  // Resolve report and fetch OData feed + metadata when mapping changes
  useEffect(() => {
    const iModelId = iModel?.iModelId;
    const iTwinId = iModel?.iTwinId;
    if (!selectedMappingId || !iModelId || !iTwinId) return;

    let cancelled = false;
    setSelectedReportId("");
    setOdataItems([]);
    setTables([]);
    setSelectedItemUrl("");
    setEntities([]);
    setColumns([]);
    setSelectedElementIds([]);

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const accessToken = await getAccessToken();
        const reports = await reportsClient.getReports(accessToken, iTwinId);

        const reportMappingsByReport = await Promise.all(
          reports.map(async (report) => ({
            reportId: report.id,
            mappings: await reportsClient.getReportMappings(accessToken, report.id),
          })),
        );

        const linkedReport = reportMappingsByReport.find((reportEntry) =>
          reportEntry.mappings.some(
            (reportMapping) =>
              reportMapping.mappingId === selectedMappingId && reportMapping.imodelId === iModelId,
          ),
        );

        if (!linkedReport) {
          if (!cancelled) {
            setError(
              "No Insights report is linked to this mapping and iModel. Link the mapping to a report and run extraction first.",
            );
          }
          return;
        }

        if (!cancelled) {
          setSelectedReportId(linkedReport.reportId);
        }

        const [feed, metadata] = await Promise.all([
          odataClient.getODataReport(accessToken, linkedReport.reportId),
          odataClient.getODataReportMetadata(accessToken, linkedReport.reportId),
        ]);
        if (!cancelled) {
          setOdataItems(feed.value);
          setTables(metadata);
        }
      } catch {
        if (!cancelled) {
          setError("Failed to load OData report for this mapping.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [selectedMappingId, iModel?.iModelId, iModel?.iTwinId]);

  // Fetch entities when table is selected
  useEffect(() => {
    if (!selectedItemUrl || !selectedReportId) return;

    const odataItem = odataItems.find((i) => i.url === selectedItemUrl);
    const table = tables.find((t) => t.name === selectedItemUrl);
    if (!odataItem) return;

    let cancelled = false;
    setEntities([]);
    setColumns([]);
    setSelectedElementIds([]);

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const accessToken = await getAccessToken();
        const data = await odataClient.getODataReportEntities(accessToken, selectedReportId, odataItem);
        if (!cancelled) {
          setEntities(data);
          if (table) {
            setColumns(table.columns.map((c) => c.name));
          } else if (data.length > 0) {
            setColumns(Object.keys(data[0]));
          }
        }
      } catch {
        if (!cancelled) setError("Failed to load entity data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [selectedItemUrl, selectedReportId, odataItems, tables]);

  if (!iModel) {
    return <div style={styles.message}>No active iModel.</div>;
  }

  const syncSelection = async (nextSelectedElementIds: string[]) => {
    selectionStorage.replaceSelection({
      imodelKey: iModel.key,
      source: SELECTION_SOURCE,
      selectables: nextSelectedElementIds.map((id) => ({ className: "BisCore:Element", id })),
    });

    setSelectedElementIds(nextSelectedElementIds);

    if (nextSelectedElementIds.length === 0) {
      return;
    }

    await activeViewport?.zoomToElements(nextSelectedElementIds);
  };

  const handleRowSelectionChange = (row: ODataEntityValue, checked: boolean) => {
    const rowElementId = getRowElementId(row, elementIdField);
    if (!rowElementId) {
      return;
    }

    const nextSelectedElementIds = checked
      ? [...new Set([...selectedElementIds, rowElementId])]
      : selectedElementIds.filter((id) => id !== rowElementId);

    void syncSelection(nextSelectedElementIds);
  };

  const handleExportCsv = () => {
    if (columns.length === 0 || exportRows.length === 0) {
      return;
    }

    const csvLines = [
      columns.map((column) => escapeCsvValue(column)).join(","),
      ...exportRows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(",")),
    ];

    const csvBlob = new Blob([csvLines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const downloadUrl = URL.createObjectURL(csvBlob);
    const link = document.createElement("a");
    const tableName = sanitizeFileNamePart(selectedItemUrl || "odata-report");
    const scopeName = allSelectableRowsSelected ? "all-rows" : "selected-rows";

    link.href = downloadUrl;
    link.download = `${tableName}-${scopeName}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  const handleSelectAllChange = (checked: boolean) => {
    void syncSelection(checked ? selectableElementIds : []);
  };

  return (
    <div style={styles.container}>
      <div style={styles.controls}>
        <label style={styles.label}>Mapping</label>
        <select
          style={styles.select}
          value={selectedMappingId}
          onChange={(e) => setSelectedMappingId(e.target.value)}
          disabled={mappings.length === 0 || loading}
        >
          <option value="">-- Select a mapping --</option>
          {mappings.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        {odataItems.length > 0 && (
          <>
            <label style={styles.label}>Entity Table</label>
            <select
              style={styles.select}
              value={selectedItemUrl}
              onChange={(e) => setSelectedItemUrl(e.target.value)}
              disabled={loading}
            >
              <option value="">-- Select a table --</option>
              {odataItems.map((item) => (
                <option key={item.url} value={item.url}>{item.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {loading && <div style={styles.loading}>Loading…</div>}
      {error && <div style={styles.error}>{error}</div>}

      {entities.length > 0 && columns.length > 0 && (
        <div style={styles.exportControls}>
          <label style={styles.exportToggleLabel}>
            <input
              type="checkbox"
              checked={allSelectableRowsSelected}
              onChange={(e) => handleSelectAllChange(e.target.checked)}
              disabled={!elementIdField || selectableElementIds.length === 0}
            />
            Select all
          </label>
          <button
            type="button"
            style={styles.exportButton}
            onClick={handleExportCsv}
            disabled={exportRows.length === 0}
          >
            Export CSV
          </button>
        </div>
      )}

      {selectedItemUrl && !loading && entities.length > 0 && !elementIdField && (
        <div style={styles.message}>
          No selectable element id column was found in this report table.
        </div>
      )}

      {entities.length > 0 && columns.length > 0 && (
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                {elementIdField && <th style={styles.checkboxHeader}>Select</th>}
                {columns.map((col) => (
                  <th key={col} style={styles.th}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entities.map((row, i) => (
                <tr key={i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                  {elementIdField && (
                    <td style={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        aria-label={`Select row ${i + 1}`}
                        checked={selectedElementIds.includes(getRowElementId(row, elementIdField) ?? "")}
                        onChange={(e) => handleRowSelectionChange(row, e.target.checked)}
                        disabled={!getRowElementId(row, elementIdField)}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col} style={styles.td}>{String(row[col] ?? "")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && selectedItemUrl && entities.length === 0 && (
        <div style={styles.message}>No data found for this table.</div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    padding: "8px",
    boxSizing: "border-box" as const,
    fontFamily: "var(--iui-font-sans, sans-serif)",
    fontSize: "12px",
    gap: "8px",
  },
  controls: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "4px",
  },
  label: {
    fontWeight: 600 as const,
    color: "var(--iui-color-text, #333)",
  },
  select: {
    width: "100%",
    padding: "4px 6px",
    border: "1px solid var(--iui-color-border, #ccc)",
    borderRadius: "3px",
    backgroundColor: "var(--iui-color-background, #fff)",
    color: "var(--iui-color-text, #333)",
  },
  loading: {
    color: "var(--iui-color-text-muted, #666)",
    padding: "4px 0",
  },
  error: {
    color: "var(--iui-color-text-negative, #c00)",
    padding: "4px",
    backgroundColor: "var(--iui-color-background-warning, #fff0f0)",
    borderRadius: "3px",
    border: "1px solid var(--iui-color-border-negative, #f99)",
  },
  exportControls: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    flexWrap: "wrap" as const,
  },
  exportToggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "var(--iui-color-text, #333)",
  },
  exportButton: {
    padding: "4px 10px",
    border: "1px solid var(--iui-color-border, #ccc)",
    borderRadius: "3px",
    backgroundColor: "var(--iui-color-background, #fff)",
    color: "var(--iui-color-text, #333)",
    cursor: "pointer",
  },
  tableWrapper: {
    flex: 1,
    overflow: "auto",
  },
  table: {
    borderCollapse: "collapse" as const,
    width: "100%",
    fontSize: "11px",
  },
  th: {
    textAlign: "left" as const,
    padding: "4px 8px",
    backgroundColor: "var(--iui-color-background-backdrop, #f0f0f0)",
    border: "1px solid var(--iui-color-border, #ddd)",
    whiteSpace: "nowrap" as const,
    position: "sticky" as const,
    top: 0,
  },
  checkboxHeader: {
    textAlign: "center" as const,
    padding: "4px 8px",
    backgroundColor: "var(--iui-color-background-backdrop, #f0f0f0)",
    border: "1px solid var(--iui-color-border, #ddd)",
    whiteSpace: "nowrap" as const,
    position: "sticky" as const,
    top: 0,
    width: "56px",
  },
  td: {
    padding: "3px 8px",
    border: "1px solid var(--iui-color-border, #eee)",
    maxWidth: "200px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  checkboxCell: {
    padding: "3px 8px",
    border: "1px solid var(--iui-color-border, #eee)",
    textAlign: "center" as const,
    width: "56px",
  },
  trEven: {
    backgroundColor: "var(--iui-color-background, #fff)",
  },
  trOdd: {
    backgroundColor: "var(--iui-color-background-zebra, #f7f7f7)",
  },
  message: {
    color: "var(--iui-color-text-muted, #666)",
    padding: "8px",
  },
};
