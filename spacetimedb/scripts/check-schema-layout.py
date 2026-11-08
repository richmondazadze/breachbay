#!/usr/bin/env python3
"""Compare authorized schema-only artifacts; never reads environment or operational rows."""
import json,sys

def resolved(value,types,seen=()):
    if isinstance(value,dict):
        if set(value)=={'Ref'}:
            index=value['Ref']
            if index in seen: raise ValueError('Recursive type requires explicit review')
            return resolved(types[index],types,(*seen,index))
        return {k:resolved(v,types,seen) for k,v in value.items()}
    if isinstance(value,list): return [resolved(v,types,seen) for v in value]
    return value

def verify(tables,typespace,proposed):
    sections={k:v for s in proposed['sections'] for k,v in s.items()}
    oldtypes=typespace['types'];newtypes=sections['Typespace']['types']
    newtables={t['source_name']:t for t in sections['Tables']}
    additions=[]
    for old in tables:
        name=old['source_name'];new=newtables[name]
        before=resolved(oldtypes[old['product_type_ref']],oldtypes)['Product']['elements']
        after=resolved(newtypes[new['product_type_ref']],newtypes)['Product']['elements']
        if after[:len(before)]!=before: raise ValueError(f'{name}: original column order/name/type changed')
        for key in ['primary_key','table_type','table_access','is_event']:
            if old[key]!=new[key]: raise ValueError(f'{name}: {key} changed')
        for key in ['indexes','constraints','sequences']:
            encode=lambda rows:sorted(json.dumps(v,sort_keys=True) for v in rows)
            if encode(old[key])!=encode(new[key]): raise ValueError(f'{name}: {key} changed')
        defaults={d['col_id']:d['value'] for d in new['default_values']}
        for default in old['default_values']:
            if defaults.get(default['col_id'])!=default['value']: raise ValueError(f'{name}: original default changed')
        for i,column in enumerate(after[len(before):],len(before)):
            variants=column['algebraic_type'].get('Sum',{}).get('variants',[])
            if [v['name'].get('some') for v in variants]!=['some','none'] or defaults.get(i)!='01':
                raise ValueError(f'{name}: appended column lacks explicit None default')
            additions.append((name,column['name']['some'],i))
    print(f'PASS all {len(tables)} actual deployed table layouts/types/indexes/constraints/defaults preserved')
    for name,column,index in additions: print(f'APPEND {name}.{column} at {index} (None default)')
    print('NEW TABLES '+', '.join(sorted(set(newtables)-{t['source_name'] for t in tables})))

if __name__=='__main__':
    verify(*(json.load(open(path)) for path in sys.argv[1:4]))
