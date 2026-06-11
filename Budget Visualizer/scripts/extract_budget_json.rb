#!/usr/bin/env ruby

require "json"
require "open3"
require "rexml/document"

SOURCE = ARGV.fetch(0)
OUTPUT = ARGV.fetch(1)

NS = {
  "m" => "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  "r" => "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  "pr" => "http://schemas.openxmlformats.org/package/2006/relationships"
}.freeze

def archive_xml(path)
  xml, status = Open3.capture2("unzip", "-p", SOURCE, path)
  raise "Could not read #{path}" unless status.success?

  REXML::Document.new(xml)
end

def column_index(reference)
  letters = reference[/[A-Z]+/]
  letters.each_byte.reduce(0) { |value, byte| (value * 26) + byte - 64 } - 1
end

def cell_value(cell)
  type = cell.attributes["t"]

  if type == "inlineStr"
    texts = REXML::XPath.match(cell, ".//m:t", NS)
    value = texts.map(&:text).join
    return value.empty? ? nil : value
  end

  raw = REXML::XPath.first(cell, "./m:v", NS)&.text
  return nil if raw.nil? || raw.empty?

  case type
  when "b"
    raw == "1"
  when "str", "s"
    raw
  else
    raw.match?(/\A-?\d+\z/) ? raw.to_i : raw.to_f
  end
end

def compact_key(label, index)
  key = label.to_s.downcase
             .gsub("&", " and ")
             .gsub(/[^a-z0-9]+/, "_")
             .gsub(/\A_+|_+\z/, "")
  key = "column_#{index + 1}" if key.empty?
  key
end

def unique_keys(labels)
  counts = Hash.new(0)
  labels.each_with_index.map do |label, index|
    base = compact_key(label, index)
    counts[base] += 1
    counts[base] == 1 ? base : "#{base}_#{counts[base]}"
  end
end

workbook = archive_xml("xl/workbook.xml")
relationships = archive_xml("xl/_rels/workbook.xml.rels")

targets = {}
REXML::XPath.each(relationships, "//pr:Relationship", NS) do |relationship|
  targets[relationship.attributes["Id"]] = relationship.attributes["Target"]
end

sheets = REXML::XPath.match(workbook, "//m:sheet", NS).map do |sheet|
  relationship_id = sheet.attributes.get_attribute_ns(NS["r"], "id")&.value
  target = targets.fetch(relationship_id).sub(%r{\A/}, "")
  target = "xl/#{target}" unless target.start_with?("xl/")

  document = archive_xml(target)
  rows = []
  max_column = -1

  REXML::XPath.each(document, "//m:sheetData/m:row", NS) do |row|
    row_number = row.attributes["r"].to_i
    values = []

    REXML::XPath.each(row, "./m:c", NS) do |cell|
      index = column_index(cell.attributes["r"])
      max_column = [max_column, index].max
      values[index] = cell_value(cell)
    end

    rows[row_number - 1] = values
  end

  rows = rows.map { |row| (row || []).fill(nil, row&.length || 0...max_column + 1) }
  rows.pop while rows.last&.all?(&:nil?)

  {
    "name" => sheet.attributes["name"],
    "source_file" => File.basename(SOURCE),
    "row_count" => rows.length,
    "column_count" => max_column + 1,
    "cells" => rows
  }
end

table_sheets = {
  "Glossary" => 4,
  "Officials" => 4,
  "Budget Summary" => 4,
  "2025 Approps Expended" => 4,
  "CAP Calculation" => 4,
  "Group Insurance Recap" => 4,
  "Levy CAP Banks" => 4,
  "Levy CAP Calculation" => 4,
  "Revenues" => 4,
  "Revenues Summary" => 4,
  "Appropriations" => 4,
  "Appropriations Summary" => 4,
  "Capital Budget 2026" => 4,
  "6-Year Capital Program" => 4,
  "Capital Funding Sources" => 4,
  "Open Space Trust Fund" => 4,
  "Arts & Culture Trust" => 4,
  "Dedicated Assessment" => 4,
  "Fund Balance & Surplus" => 4,
  "Change Orders" => 4
}.freeze

tables = {}
table_sheets.each do |sheet_name, header_row|
  sheet = sheets.find { |item| item["name"] == sheet_name }
  next unless sheet

  headers = sheet["cells"][header_row - 1] || []
  keys = unique_keys(headers)
  records = sheet["cells"].drop(header_row).map do |values|
    next if values.all?(&:nil?)

    keys.each_with_index.to_h { |key, index| [key, values[index]] }
  end.compact

  tables[compact_key(sheet_name, 0)] = {
    "title" => sheet["cells"].dig(0, 0),
    "description" => sheet["cells"].dig(1, 0),
    "source_sheet" => sheet_name,
    "columns" => headers.each_with_index.map { |label, index| { "key" => keys[index], "label" => label } },
    "rows" => records
  }
end

overview_sheet = sheets.find { |sheet| sheet["name"] == "Overview" }
overview = (overview_sheet&.fetch("cells", []) || []).map do |row|
  next if row.all?(&:nil?)

  row.compact.join(" ")
end.compact

budget_summary = tables.fetch("budget_summary")["rows"]
revenues_summary = tables.fetch("revenues_summary")["rows"]
cap_calculation = tables.fetch("cap_calculation")["rows"]
levy_cap_calculation = tables.fetch("levy_cap_calculation")["rows"]
fund_balance = tables.fetch("fund_balance_and_surplus")["rows"]

find_row = lambda do |rows, key, text|
  rows.find { |row| row[key].to_s.include?(text) }
end

headline = {
  "total_budget" => {
    "amount" => find_row.call(budget_summary, "line", "4")["amount_2026_usd"],
    "source" => "Budget Summary, Sheet 3"
  },
  "municipal_property_tax" => {
    "amount" => find_row.call(budget_summary, "line", "6(a)")["amount_2026_usd"],
    "source" => "Budget Summary, Sheet 3"
  },
  "surplus_used" => {
    "amount" => find_row.call(revenues_summary, "description", "Surplus Anticipated")["anticipated_2026_usd"],
    "source" => "Revenues Summary, Sheet 11"
  },
  "appropriations_within_caps" => {
    "amount" => find_row.call(budget_summary, "line", "1(a)")["amount_2026_usd"],
    "source" => "Budget Summary, Sheet 3"
  },
  "appropriations_excluded_from_caps" => {
    "amount" => find_row.call(budget_summary, "line", "2(a)")["amount_2026_usd"],
    "source" => "Budget Summary, Sheet 3"
  },
  "reserve_for_uncollected_taxes" => {
    "amount" => find_row.call(budget_summary, "line", "3")["amount_2026_usd"],
    "source" => "Budget Summary, Sheet 3"
  },
  "appropriation_cap_under" => {
    "amount" => cap_calculation.last["amount_usd"],
    "source" => "CAP Calculation, Sheet 3b"
  },
  "levy_cap_under" => {
    "amount" => levy_cap_calculation.last["amount"],
    "source" => "Levy CAP Calculation, Sheet 3-Levy CAP"
  },
  "fund_balance_at_2025_year_end" => {
    "amount" => find_row.call(
      fund_balance,
      "balance_sheet_december_31_2025",
      "Surplus Balance, December 31, 2025"
    )["amount_usd"],
    "source" => "Fund Balance & Surplus, Sheet 39"
  }
}

payload = {
  "metadata" => {
    "title" => "West Windsor Township 2026 Adopted Budget",
    "source_workbook" => File.basename(SOURCE),
    "extraction_policy" => [
      "Values are copied from the supplied workbook without recalculation.",
      "Blank workbook cells are represented as null, not zero.",
      "Original labels, FCOA codes, notes, and source-sheet references are retained."
    ],
    "sheet_count" => sheets.length
  },
  "overview" => overview,
  "headline" => headline,
  "tables" => tables,
  "raw_sheets" => sheets
}

File.write(OUTPUT, JSON.pretty_generate(payload) + "\n")
