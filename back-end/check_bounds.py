import json

data = json.load(open(r'C:\Users\fabian.bustos\Downloads\20USA_2022_16_02_Residential (1).json'))
tree = data.get('tree_state', {}).get('base_year', data)

def show_vars(node, path='root'):
    w = node.get('weight', 1.0)
    min_w = node.get('min_weight', 0.0)
    max_w = node.get('max_weight', 1.0)
    print(f'{path} weight: {w} [{min_w}, {max_w}]')
    fuels = node.get('fuels', [])
    for f in fuels:
        print(f'  {f.get("fuel_id")} share: {f.get("share")} [{f.get("min_weight")}, {f.get("max_weight")}]')
    for c in node.get('children', []):
        show_vars(c, path + '.' + c.get('name', 'child'))

show_vars(tree)
