// Interaction Combinators
// -----------------------

function is_node(tree) {
  return typeof tree === "object" && Array.isArray(tree);
}

function is_var(tree) {
  return typeof tree === "number";
}

function is_era(tree) {
  return tree === null;
}

function is_free(tree) {
  return typeof tree === "string";
}

var FRESH = 0;
function fresh() {
  return (FRESH += 1) - 1;
}

function copy(tree, vars = {}) {
  if (is_node(tree)) {
    return [tree[0], copy(tree[1],vars), copy(tree[2],vars)];
  }
  if (is_var(tree)) {
    if (vars[tree] === undefined) {
      vars[tree] = fresh();
    }
    return vars[tree];
  }
  if (is_era(tree)) {
    return null;
  }
  if (is_free(tree)) {
    return tree;
  }
}

function def(tree) {
  return () => copy(tree);
}

function subst(tree, from, to) {
  //console.log("- subst [", from, "<-", to, "] in ", tree);
  if (is_node(tree)) {
    tree[1] = subst(tree[1], from, to);
    tree[2] = subst(tree[2], from, to);
    return tree;
  }
  if (is_var(tree)) {
    return tree === from ? to : tree;
  }
  if (is_era(tree)) {
    return null;
  }
  if (is_free(tree)) {
    return tree;
  }
}

function subst_all(graph, from, to) {
  for (var pair of graph) {
    if (pair) {
      for (var tree of pair) {
        subst(tree, from, to);
      }
    }
  }
}

function link(graph, a, b) {
  // If both are nodes, create a new active pair
  if (is_node(a) && is_node(b)) {
    //console.log("link node-node");
    graph.push([a,b]);
  }
  // If one is a node and the other is an era, erase
  else if (is_era(a) && is_node(b)) {
    //console.log("link era-node");
    graph.push([null, b[1]]);
    graph.push([null, b[2]]);
  }
  else if (is_node(a) && is_era(b)) {
    //console.log("link node-era");
    graph.push([a[1], null]);
    graph.push([a[2], null]);
  }
  // If one is a var, perform a global substitution
  else if (is_var(a)) {
    //console.log("link A var", a, "=", JSON.stringify(b));
    subst_all(graph, a, b);
  }
  else if (is_var(b)) {
    //console.log("link B var", b, "=", JSON.stringify(a));
    subst_all(graph, b, a);
  }
  // If one is a free, re-add the stuck pair
  else if (is_free(a)) {
    graph.push([a, b]);
  }
  else if (is_free(b)) {
    graph.push([a, b]);
  }
}

function interact(graph, index) {
  if (graph[index]) {
    var [a,b] = graph[index];
    // Annihilate
    if (is_node(a) && is_node(b) && a[0] === b[0]) {
      //console.log("annihilate", JSON.stringify(a), JSON.stringify(b));
      link(graph, a[1], b[1]);
      link(graph, a[2], b[2]);
      graph[index] = null;
    }
    // Commute
    else if (is_node(a) && is_node(b) && a[0] !== b[0]) {
      //console.log("commute");
      var x0 = fresh();
      var x1 = fresh();
      var x2 = fresh();
      var x3 = fresh();
      var a2 = [b[0], x0, x1];
      var a1 = [b[0], x2, x3];
      var b1 = [a[0], x2, x0];
      var b2 = [a[0], x3, x1];
      link(graph, a[1], a1);
      link(graph, a[2], a2);
      link(graph, b[1], b1);
      link(graph, b[2], b2);
      graph[index] = null;
    }
    // Erase
    else if (is_node(a) && is_era(b)) {
      //console.log("erase");
      link(graph, a[1], null);
      link(graph, a[2], null);
      graph[index] = null;
    }
    // Erase
    else if (is_era(a) && is_node(b)) {
      //console.log("erase");
      link(graph, b[1], null);
      link(graph, b[2], null);
      graph[index] = null;
    } else {
      //console.log("?????");
    }
  }
}

function reduce(graph) {
  var len = graph.length;
  for (var i = 0; i < len; ++i) {
    interact(graph, i);
  }
}


// Rendering
// ---------

function V2(x, y) {
  return {x: x, y: y};
}

function add(a, b) {
  return V2(a.x + b.x, a.y + b.y);
}

function neg(a) {
  return V2(-a.x, -a.y);
}

// Converts a number to an alphanumeric string, with a-z, A-Z, 0-9 digits
// Example: f(0) = 'a', f(1) = 'b', ..., f(...) = 'aa', f(...) = 'ab', ...
function as_name(n) {
  var chr = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var str = "";
  while (n >= chr.length) {
    str = chr[n % chr.length] + str;
    n = Math.floor(n / chr.length);
  }
  return chr[n] + str;
}

function draw_trig(ctx, p1, p2, p3, fill = "white") {
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p3.x, p3.y);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = "black";
  ctx.stroke();
}

function draw_line(ctx, p1, p2, stroke = "black") {
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function draw_text(ctx, pos, text, size = 10) {
  ctx.font = size+"px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "black";
  ctx.fillText(text, pos.x, pos.y);
}

function draw_tree(ctx, pos, tree) {

  // Triangle width
  var TW = 16;

  // How many nodes exist in total, per layer
  var total_per_layer = {};
  function compute_total_per_layer(tree, depth = 0) {
    total_per_layer[depth] = (total_per_layer[depth] || 0) + 1;
    if (is_node(tree)) {
      compute_total_per_layer(tree[1], depth + 1);
      compute_total_per_layer(tree[2], depth + 1);
    }
  }
  compute_total_per_layer(tree);
  //console.log(total_per_layer);

  // How many nodes we already drawn, per layer
  var drawn_per_layer = {};

  // Mutably generates a new node index, at given layer
  function gen_index(depth) {
    if (!drawn_per_layer[depth]) {
      drawn_per_layer[depth] = 0;
    }
    var index = drawn_per_layer[depth];
    drawn_per_layer[depth] += 1;
    return index;
  }

  // Draws nodes recursively
  function draw_node(pos, tree, depth = 0) {
    if (is_node(tree)) {
      // Computes port positions
      var p0 = pos;
      var p1 = add(pos,V2(-TW/2,TW));
      var p2 = add(pos,V2(+TW/2,TW));

      var cols = {
        0: "#F0F0F0",
        1: "#000000",
        2: "#808080",
        3: "#404040",
        4: "#B0B0B0",
        5: "red",
        6: "green",
        7: "blue",
      }

      // Draws this node's triangle
      draw_trig(ctx, p0, p1, p2, cols[tree[0]] || "brown");

      // Draws this node's children
      var total = total_per_layer[depth + 1];
      var space = TW * 2;
      var width = total * space;
      var c1    = add(cpos, V2(-width*0.5 + gen_index(depth) * space, (depth+1)*TW*2));
      var c2    = add(cpos, V2(-width*0.5 + gen_index(depth) * space, (depth+1)*TW*2));
      draw_line(ctx, p1, c1, "gray");
      draw_node(c1, tree[1], depth + 1);
      draw_line(ctx, p2, c2, "gray");
      draw_node(c2, tree[2], depth + 1);
    }
    if (is_var(tree)) {
      draw_text(ctx, pos, as_name(tree), TW);
    }
    if (is_era(tree)) {
      draw_text(ctx, pos, "-", TW);
    }
    if (is_free(tree)) {
      draw_text(ctx, pos, tree, TW);
    }
  }

  // Computes total width used (using the max total_per_layer) and total height used
  var width = Math.max(...Object.values(total_per_layer)) * TW * 2;
  var height = Object.keys(total_per_layer).length * TW * 2;
  var rpos = {x: pos.x + width * 0.5, y: pos.y};
  var cpos = add(rpos, V2(0, TW));

  // Draws the tree
  draw_node(cpos, tree);

  // Draws root wire
  draw_line(ctx, rpos, cpos, "gray");

  // Returns dimensions
  return {dim: {width, height}, pos: rpos};
}

function draw_graph(ctx, pos, pairs) {
  for (var pair of pairs) {
    if (pair) {
      var other_pos = null;
      for (var tree of pair) {
        var drawn = draw_tree(ctx, pos, tree);
        pos = add(pos, {x: drawn.dim.width, y: 0});
        if (!other_pos) {
          other_pos = drawn.pos;
        } else {
          draw_line(ctx, other_pos, drawn.pos, "gray");
          other = null;
        }
      }
    }
  }
}

function init() {
  var scr = document.getElementById('screen');
  //scr.width = window.innerWidth * 8;
  //scr.height = window.innerHeight;
}

function draw() {
  var scr = document.getElementById('screen');
  var ctx = scr.getContext('2d');
  ctx.clearRect(0, 0, scr.width, scr.height);
  draw_graph(ctx, V2(32, 32), main);
}

// Tests
// -----

// reduces main when space is pressed
document.addEventListener('keydown', function(event) {
  if (event.code === 'Space') {
    reduce(main);
    draw();
  }
});

// initial setup
window.onload = function() {
  init();
  draw();
}

// λf. λx. (f (f x))
var c2_a = def([0,[1,[0,0,1],[0,2,0]],[0,2,1]]);

// λf. λx. (f (f x))
var c2_b = def([0,[2,[0,0,1],[0,2,0]],[0,2,1]]);

// λf. λx. (f (f x))
var c2_c = def([0,[3,[0,0,1],[0,2,0]],[0,2,1]]);

// λf. λx. (f (f (f x)))
var c3_a = def([0,[4,[0,0,4],[4,[0,1,0],[0,2,1]]],[0,2,4]]);

// λf. λx. (f (f (f x)))
var c3_b = def([0,[5,[0,0,4],[5,[0,1,0],[0,2,1]]],[0,2,4]]);

// λn. λs. λz. (s n)
var succ = def([0,0,[0,[0,0,1],[0,null,1]]]);

// λs. λz. z
var zero = def([0,null,[0,0,0]]);

// λn. (n λx. λp. ((p x) x) λk. k)

var gen_s = def([0, [6, 0, 1], [0, [0, 0, [0, 1, 2]], 2]]);
var gen_z = def([0, 3, 3]);
var gen   = def([0, [0, gen_s(), [0, gen_z(), 4]], 4]);

// ((((c2 c2) c2) succ) zero)
//var main = [[c3_a(),[0,c2_a(),[0,succ(),[0,zero(),"@"]]]]];
//var main = [[c2_a(), [0,c2_b(),[0,c2_c(),[0,succ(),[0,zero(),"@"]]]]]];

// (gen ((c2 c2) c2))
var main = [[c2_a(),[0,c2_b(),[0,c2_c(),[0,gen_s(),[0,gen_z(),"@"]]]]]];
