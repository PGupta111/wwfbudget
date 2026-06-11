#!/usr/bin/env ruby

require "json"

data = JSON.parse(File.read(ARGV.fetch(0)))

expected = {
  ["headline", "total_budget", "amount"] => 57_685_649.81,
  ["headline", "municipal_property_tax", "amount"] => 28_550_275.18,
  ["headline", "surplus_used", "amount"] => 13_425_000,
  ["headline", "appropriation_cap_under", "amount"] => -593_886.83,
  ["headline", "levy_cap_under", "amount"] => -547_345.57
}

expected.each do |path, value|
  actual = path.reduce(data) { |object, key| object.fetch(key) }
  raise "#{path.join(".")}: expected #{value}, got #{actual}" unless actual == value
end

raise "Expected 21 sheets" unless data.dig("metadata", "sheet_count") == 21
raise "Expected 69 revenue rows" unless data.dig("tables", "revenues", "rows").length == 69
raise "Expected 170 appropriation rows" unless data.dig("tables", "appropriations", "rows").length == 170
raise "Expected 40 capital rows" unless data.dig("tables", "capital_budget_2026", "rows").length == 40

table_keys_are_unique = data["tables"].all? do |_name, table|
  keys = table["columns"].map { |column| column["key"] }
  keys.length == keys.uniq.length && keys.none?(&:empty?)
end
raise "Table keys must be non-empty and unique" unless table_keys_are_unique

puts "Validated #{data.dig("metadata", "sheet_count")} sheets, " \
     "#{data.dig("tables", "revenues", "rows").length} revenue rows, " \
     "#{data.dig("tables", "appropriations", "rows").length} appropriation rows, " \
     "and all headline totals."
