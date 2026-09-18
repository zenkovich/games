"""Share OBJ position/normal/UV records without changing faces or topology."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def compact(path):
    arrays={key:[] for key in ['v','vt','vn']}; lookup={key:{} for key in arrays}; remap={key:[] for key in arrays}; faces=[]
    for line in path.read_text().splitlines():
        fields=line.split()
        if not fields:continue
        kind=fields[0]
        if kind in arrays:
            precision={'v':3,'vt':5,'vn':3}[kind]
            entry=' '.join(f'{float(v):.{precision}f}'.rstrip('0').rstrip('.') or '0' for v in fields[1:])
            if entry not in lookup[kind]:
                lookup[kind][entry]=len(arrays[kind])+1;arrays[kind].append(entry)
            remap[kind].append(lookup[kind][entry])
        elif kind=='f':faces.append([tuple(int(i)-1 for i in v.split('/')) for v in fields[1:]])
    lines=['# Shared OBJ attributes; Tools/Art/compact_obj.py']
    for kind,values in arrays.items():lines.extend(kind+' '+v for v in values)
    for face in faces:
        lines.append('f '+' '.join('/'.join(str(remap[key][i]) for key,i in zip(['v','vt','vn'],v)) for v in face))
    path.write_text('\n'.join(lines)+'\n')

if __name__=='__main__':
    for name in ['Brain','SahurStand','FarmDecor','GardenBed','FarmGround','BuildPad','Guide']:
        compact(ROOT/'Assets/Models'/f'{name}.obj')
