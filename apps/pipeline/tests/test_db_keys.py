"""Pure tests for the db module: scope keys and the SQL strings it builds.

Nothing here opens a connection; the SQL builders are plain functions.
"""

import unittest

from tender_extract import db


class ScopeKeyTests(unittest.TestCase):
    def test_lot_key_joins_with_pipe(self):
        self.assertEqual(db.lot_key("a", "b", "01", "LOT-0001"), "a|b|01|LOT-0001")

    def test_lot_key_defaults_missing_version_to_01(self):
        self.assertEqual(db.lot_key("oev", "N-1", None, "LOT-0000"), "oev|N-1|01|LOT-0000")

    def test_procedure_key_is_lot_key_prefix(self):
        lot = db.lot_key("oev", "N-1", "02", "LOT-0003")
        self.assertEqual(db.procedure_key("oev", "N-1"), "oev|N-1")
        self.assertTrue(lot.startswith(db.procedure_key("oev", "N-1") + "|"))


class UpsertSqlTests(unittest.TestCase):
    def test_update_all_non_conflict_columns(self):
        sql = db._upsert_sql("lot", ["source", "notice_id", "title"], ["source", "notice_id"])
        self.assertEqual(
            sql,
            "INSERT INTO lot (source, notice_id, title) "
            "VALUES (%(source)s, %(notice_id)s, %(title)s) "
            "ON CONFLICT (source, notice_id) DO UPDATE SET title = EXCLUDED.title",
        )

    def test_update_false_does_nothing_on_conflict(self):
        sql = db._upsert_sql("observation", ["scope_key", "attribute", "value_text"],
                             ["scope_key", "attribute"], update=False)
        self.assertTrue(sql.endswith("ON CONFLICT (scope_key, attribute) DO NOTHING"))
        self.assertNotIn("UPDATE", sql)

    def test_update_subset_only_touches_present_columns(self):
        sql = db._upsert_sql("source", ["id", "kind", "status", "pages"], ["id"],
                             update=db.SOURCE_UPDATE_COLUMNS)
        self.assertTrue(sql.endswith("DO UPDATE SET status = EXCLUDED.status, pages = EXCLUDED.pages"))
        self.assertNotIn("kind = EXCLUDED", sql)
        self.assertNotIn("fetched_at", sql)

    def test_only_conflict_columns_falls_back_to_do_nothing(self):
        sql = db._upsert_sql("t", ["a", "b"], ["a", "b"])
        self.assertTrue(sql.endswith("DO NOTHING"))

    def test_rejects_unsafe_identifiers(self):
        with self.assertRaises(ValueError):
            db._upsert_sql("lot", ["title; DROP TABLE lot"], ["source"])
        with self.assertRaises(ValueError):
            db._upsert_sql("lot", ["Title"], ["source"])


class RowAdaptationTests(unittest.TestCase):
    def test_json_values_wrapped_arrays_passed_through(self):
        row = db._adapt({
            "cpv_additional": ["45000000", "45210000"],
            "extra": {"k": 1},
            "qualification_text": ["Referenzen"],
            "title": "Neubau",
        })
        self.assertIsInstance(row["cpv_additional"], db.Jsonb)
        self.assertIsInstance(row["extra"], db.Jsonb)
        self.assertEqual(row["qualification_text"], ["Referenzen"])
        self.assertEqual(row["title"], "Neubau")

    def test_group_by_keys_shares_one_statement_per_shape(self):
        rows = [{"a": 1, "b": 2}, {"a": 3, "b": 4}, {"a": 5}]
        groups = db._group_by_keys(rows)
        self.assertEqual(set(groups), {("a", "b"), ("a",)})
        self.assertEqual(len(groups[("a", "b")]), 2)

    def test_observation_statement_never_updates(self):
        keys = ["scope_type", "scope_key", "kind", "attribute", "extractor", "source_id", "value_text"]
        sql = db._upsert_sql("observation", keys, db.OBSERVATION_CONFLICT_COLUMNS, update=False)
        self.assertIn("ON CONFLICT (scope_key, attribute, extractor, source_id) DO NOTHING", sql)


if __name__ == "__main__":
    unittest.main()
