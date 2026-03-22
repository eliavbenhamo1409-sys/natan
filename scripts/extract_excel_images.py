#!/usr/bin/env python3
"""
Extract Rich Data images from XLSX with exact row mapping.

Excel stores "Place in Cell" images via rich data, not drawing anchors.
The chain is: cell vm="N" -> rdrichvalue.xml (index N) -> richValueRel.xml.rels -> media file.

Usage: python3 scripts/extract_excel_images.py <path_to_xlsx> [output_dir]
"""

import sys
import os
import json
import re
import zipfile
from xml.etree import ElementTree as ET
from io import BytesIO

try:
    from PIL import Image
except ImportError:
    Image = None


def extract_rich_data_images(xlsx_path, output_dir):
    os.makedirs(output_dir, exist_ok=True)

    with zipfile.ZipFile(xlsx_path, 'r') as zf:
        names = zf.namelist()

        # Step 1: Read richValueRel.xml.rels to get rId -> media file mapping
        rel_path = 'xl/richData/_rels/richValueRel.xml.rels'
        if rel_path not in names:
            print(f"No {rel_path} found - this file may not have rich data images")
            return

        rel_xml = zf.read(rel_path).decode('utf-8')
        rel_tree = ET.fromstring(rel_xml)
        ns_rel = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}

        rid_to_media = {}
        for rel in rel_tree.findall('.//r:Relationship', ns_rel) or rel_tree.findall('.//{http://schemas.openxmlformats.org/package/2006/relationships}Relationship'):
            rid = rel.get('Id')
            target = rel.get('Target', '')
            if target.startswith('../'):
                target = 'xl/' + target[3:]
            elif not target.startswith('xl/'):
                target = 'xl/richData/' + target
            rid_to_media[rid] = target

        if not rid_to_media:
            # Try without namespace
            for rel in rel_tree:
                rid = rel.get('Id')
                target = rel.get('Target', '')
                if target.startswith('../'):
                    target = 'xl/' + target[3:]
                elif not target.startswith('xl/'):
                    target = 'xl/richData/' + target
                rid_to_media[rid] = target

        print(f"Step 1: {len(rid_to_media)} media relationships found")

        # Step 2: Read rdrichvalue.xml to get vm_index -> rId mapping
        rv_path = 'xl/richData/rdrichvalue.xml'
        if rv_path not in names:
            print(f"No {rv_path} found")
            return

        rv_xml = zf.read(rv_path).decode('utf-8')

        # Parse rich values - each <rv> element is indexed by position (0-based)
        # Inside each <rv>, look for <v> elements - the image reference is typically
        # in a <v> that contains a relationship index
        rv_tree = ET.fromstring(rv_xml)

        # Get the namespace
        rv_ns_match = re.match(r'\{([^}]+)\}', rv_tree.tag)
        rv_ns = rv_ns_match.group(1) if rv_ns_match else ''
        ns = {'rv': rv_ns} if rv_ns else {}

        # Also need richValueRel.xml for the mapping from value index to rId
        rvrel_path = 'xl/richData/richValueRel.xml'
        if rvrel_path in names:
            rvrel_xml = zf.read(rvrel_path).decode('utf-8')
            rvrel_tree = ET.fromstring(rvrel_xml)
            rvrel_ns_match = re.match(r'\{([^}]+)\}', rvrel_tree.tag)
            rvrel_ns = rvrel_ns_match.group(1) if rvrel_ns_match else ''

            # Each <rel> in richValueRel.xml has r:id attribute pointing to rId in .rels
            rel_entries = []
            for child in rvrel_tree:
                r_id = None
                for attr_name, attr_val in child.attrib.items():
                    if attr_name.endswith('}id') or attr_name == 'id':
                        r_id = attr_val
                        break
                    if 'id' in attr_name.lower():
                        r_id = attr_val
                        break
                rel_entries.append(r_id)

            print(f"Step 2a: {len(rel_entries)} rich value rel entries")
        else:
            rel_entries = []

        # Map vm_index to media file
        # The rv elements in rdrichvalue.xml each reference a rel entry index
        rv_elements = list(rv_tree)
        vm_to_media = {}

        print(f"Step 2b: {len(rv_elements)} rich value elements")

        # Strategy: try to find which rv elements reference images
        # rv elements have <v> children, one of which contains the rel index
        for vm_idx, rv_elem in enumerate(rv_elements):
            v_elements = list(rv_elem)
            for v_elem in v_elements:
                val = v_elem.text
                if val is not None and val.strip().isdigit():
                    rel_idx = int(val.strip())
                    if rel_idx < len(rel_entries) and rel_entries[rel_idx]:
                        r_id = rel_entries[rel_idx]
                        if r_id in rid_to_media:
                            media_path = rid_to_media[r_id]
                            if media_path in names:
                                vm_to_media[vm_idx] = media_path
                                break

        print(f"Step 2c: {len(vm_to_media)} vm indices mapped to media files")

        # Step 3: Read sheet1.xml to find cells with vm attribute -> get row numbers
        sheet_path = 'xl/worksheets/sheet1.xml'
        sheet_xml = zf.read(sheet_path).decode('utf-8')

        # Use regex for speed on large XML
        # Find all cells with vm attribute: <c r="X123" ... vm="N" ...>
        cell_vm_pattern = re.compile(r'<c\s[^>]*?r="([A-Z]+)(\d+)"[^>]*?vm="(\d+)"')
        cell_vm_pattern2 = re.compile(r'<c\s[^>]*?vm="(\d+)"[^>]*?r="([A-Z]+)(\d+)"')

        row_to_vm = {}
        for m in cell_vm_pattern.finditer(sheet_xml):
            col_letter, row_num, vm_idx = m.group(1), int(m.group(2)), int(m.group(3))
            row_to_vm[row_num] = vm_idx

        for m in cell_vm_pattern2.finditer(sheet_xml):
            vm_idx, col_letter, row_num = int(m.group(1)), m.group(2), int(m.group(3))
            if row_num not in row_to_vm:
                row_to_vm[row_num] = vm_idx

        print(f"Step 3: {len(row_to_vm)} cells with vm attribute found")

        if row_to_vm:
            sorted_rows = sorted(row_to_vm.keys())
            print(f"  Row range: {sorted_rows[0]} to {sorted_rows[-1]}")

        # Step 4: Build final mapping and extract images
        mapping = {}
        extracted = 0

        for excel_row, vm_idx in sorted(row_to_vm.items()):
            data_row = excel_row - 1  # row 1 = header, row 2 = data_row 1

            if vm_idx in vm_to_media:
                media_path = vm_to_media[vm_idx]
                img_data = zf.read(media_path)

                out_filename = f"row_{data_row}.png"
                out_path = os.path.join(output_dir, out_filename)

                if Image:
                    try:
                        pil_img = Image.open(BytesIO(img_data))
                        pil_img.save(out_path, "PNG")
                    except Exception:
                        with open(out_path, "wb") as f:
                            f.write(img_data)
                else:
                    with open(out_path, "wb") as f:
                        f.write(img_data)

                mapping[str(data_row)] = out_filename
                extracted += 1

                if extracted <= 5 or extracted % 100 == 0:
                    size_kb = len(img_data) / 1024
                    print(f"  Excel row {excel_row} (data={data_row}), vm={vm_idx} -> {out_filename} ({size_kb:.1f}KB)")

        # If direct mapping didn't work, try positional approach
        if extracted == 0:
            print("\nDirect vm->media mapping failed. Trying positional approach...")
            # Sort rows by row number, sort media by relationship order
            sorted_vm_rows = sorted(row_to_vm.items(), key=lambda x: x[0])
            sorted_media = sorted(rid_to_media.items(), key=lambda x: int(re.search(r'\d+', x[0]).group()) if re.search(r'\d+', x[0]) else 0)

            media_files_sorted = []
            for rid, media_path in sorted_media:
                if media_path in names and any(media_path.lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.emf', '.wmf', '.webp']):
                    media_files_sorted.append((rid, media_path))

            print(f"  {len(sorted_vm_rows)} rows with images, {len(media_files_sorted)} media files")

            count = min(len(sorted_vm_rows), len(media_files_sorted))
            for i in range(count):
                excel_row = sorted_vm_rows[i][0]
                data_row = excel_row - 1
                media_path = media_files_sorted[i][1]

                img_data = zf.read(media_path)
                out_filename = f"row_{data_row}.png"
                out_path = os.path.join(output_dir, out_filename)

                if Image:
                    try:
                        pil_img = Image.open(BytesIO(img_data))
                        pil_img.save(out_path, "PNG")
                    except Exception:
                        with open(out_path, "wb") as f:
                            f.write(img_data)
                else:
                    with open(out_path, "wb") as f:
                        f.write(img_data)

                mapping[str(data_row)] = out_filename
                extracted += 1

                if extracted <= 5 or extracted % 100 == 0:
                    size_kb = len(img_data) / 1024
                    print(f"  Excel row {excel_row} (data={data_row}) -> {out_filename} ({size_kb:.1f}KB)")

        manifest = {
            "total_images": len(mapping),
            "total_sheet_rows": max(row_to_vm.keys()) if row_to_vm else 0,
            "images": mapping
        }

        manifest_path = os.path.join(output_dir, "manifest.json")
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2)

        print(f"\nDone! {extracted} images extracted to {output_dir}")
        print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/extract_excel_images.py <path_to_xlsx> [output_dir]")
        sys.exit(1)

    xlsx_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(xlsx_path)), "extracted_images")

    if not os.path.exists(xlsx_path):
        print(f"File not found: {xlsx_path}")
        sys.exit(1)

    extract_rich_data_images(xlsx_path, output_dir)
