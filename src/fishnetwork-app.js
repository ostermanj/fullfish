/* global d3 */
/* exported NodeListForEach */
import { NodeListForEach, arrayFind } from './polyfills.js';
import { stateModule as S } from 'stateful-dead';
import PS from 'pubsub-setter';
import fisheries from './data/fisheries-sorted.csv';
import clusters from './data/clusters.csv';
import network from './data/network.csv';
import species from './data/species.json';
import gear from './data/gear.json';
import area from './data/regions.json';
import fields from './data/fields.json';
import descriptions from './data/descriptions.json';
import selectionView from './views/selection/selection.js';
import mapView from  './views/map/map.js';
import sidebarView from  './views/sidebar/sidebar.js';
import listContainer from './views/lists/lists.js';
import sidebarStyles from './views/sidebar/styles.scss'; // should be unnecessary after refactor to constructor pattern


var fullAPI = (function(){
    var attributeOrder = ['species','gear','area'];  
    var sidebars = [
        {
            name: 'Fishery details',
            id: 'fisheries',
            data: fisheries,
            fields: ['permits','degree','avg_edge_weight','closeness_centrality'],
            charts: []
        },
        {
            name: 'Cluster details',
            id: 'clusters',
            data: clusters,
            fields: ['density','fisheries','avg_permits','avg_degree', 'avg_edge_weight_cluster', 'avg_closeness_centrality'],
            charts: [] 
        },
        {
            name: 'Network details',
            id: 'network',
            data: network,
            fields: ['density','fisheries','avg_permits','avg_degree', 'avg_edge_weight', 'avg_closeness_centrality'] 
        }
    ];
    var controller = {
        init(){
            NodeListForEach();
            arrayFind();
            PS.setSubs([
                ['cluster', this.updateClusterDetails],
                ['highlightConnected', this.highlightConnected],
                ['partialSelection', this.checkDropdownOptions],
                ['preview', this.updateFisheryDetails],
                ['preview', this.highlightNodes],
                ['selection', this.selectFishery],
                ['selection', this.highlightNodes],
                ['selection', this.updateFisheryDetails],
                ['selection', this.updateLists],
                ['selection', this.announceClusterState],
                ['selection', this.highlightListItems]
            ]);
            this.createScrollWatcher();
            console.log(fisheries);
            this.createFishArrays();
            var selectionDiv = selectionView.init(model); // method: document.querySelector('.main-column').appendChild(div);
            console.log(selectionDiv);
            this.selectionOnRender(selectionDiv);
            this.mapViewOnRender(mapView.init()); // method: document.querySelector('.main-column').appendChild(div);
            sidebars.forEach(sidebar => {
                sidebarView.init.call(model,sidebar); // method: document.querySelector('.side-column').appendChild(div);
            });
            this.setNetworkDetails();
            views.listContainer = new listContainer('#fisheries-details',[{title:'Fisheries most connected to [selected]', id: 'relative'}]);
            views.mostAndLeastList = new listContainer('.map-container',[{title:'Most closely connected fisheries', id: 'most'},{title: 'Least closely connected fisheries', id: 'least'}], model.fisheries); 
           
        },
        scrollPositions: 0,
        createScrollWatcher(){
            var html = document.querySelector('html');
            var body = document.querySelector('body');
            var timeout;
            window.onscroll = function(){
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    console.log(body.scrollTop);
                    console.log(html.scrollTop);    
                    controller.scrollPosition = Math.max(body.scrollTop, html.scrollTop);
                    console.log(controller.scrollPosition);
                },250);
            }
        },
        updateLists(msg,data){
            views.listContainer.children.forEach(list => {
                list.update(msg,data,controller.fadeInText,model);
            });
        },
        createFishArrays(){
            [...attributeOrder, 'id'].forEach(attr => {
                model[attr] = [];
                model.fisheries.forEach(each => {
                    if ( model[attr].indexOf(each[attr]) === -1 ){
                        model[attr].push(each[attr]);
                    }
                });
                if ( attr !== 'id' ){
                    model[attr].sort((a,b) => {
                        if ( isNaN(parseInt(a)) && isNaN(parseInt(b))){
                            if ( a < b ) return -1;
                            if ( a > b ) return 1;
                            return 0;
                        } else {
                            if ( parseInt(a) < parseInt(b) ) return -1;
                            if ( parseInt(a) > parseInt(b) ) return 1;
                            return 0;
                        }
                    });
                }
              //  model[attr].sort((a,b) => d3.ascending(a,b));
            });
            console.log(model);
        },
        selectionOnRender(div){
            div.querySelectorAll('select, button').forEach((select,i, array) => {
                select.onfocus = function(){
                    console.log(controller.scrollPosition);
                    window.scrollTo(0,controller.scrollPosition);
                };
                if ( i === 0 || i === array.length - 1 ) {
                    select.removeAttribute('disabled');
                }
                if ( i < array.length - 1 ){
                    select.onchange = function(e){

                        S.setState('partialSelection', e.target.value.split('--'));
                    };
                } else {
                    select.onchange = function(e){
                        e.preventDefault();
                        S.setState('selection', e.target.value.split('--'));
                    };
                }
            });
            div.querySelector('#clear-all').onclick = () => {
                //this.resetSelections();
                S.setState('selection', null);
            };

        },
        announceClusterState(msg,data){
            console.log(msg,data);
            var cluster = data !== null ? model.fisheries.find(f => f.id === data[1]).cluster : null;
            console.log(cluster);
            S.setState('cluster', cluster);
        },
        checkDropdownOptions(msg,data){
            model.matching.fisheries = model.matching.fisheries.filter(each => { // filter the fisheries acc to selection
                var value = isNaN(+data[1]) ? data[1] : +data[1];
                console.log(value);
                return each[data[0]] === value;
            });
            attributeOrder.forEach(attr => { // create array for each attribute consisting only of available values
                
                model.matching[attr] = [];
                model.matching.fisheries.forEach(each => {
                    if ( model.matching[attr].indexOf(each[attr]) === -1 ){
                        model.matching[attr].push(each[attr]);
                    }
                });
            });
            var index = attributeOrder.indexOf(data[0]);
            document.getElementById('dropdown-' + data[0]).setAttribute('disabled',''); // disable the just selected drodown and
                                                                                        // the unavailable options in the next dropdown(s) 
            if ( index < attributeOrder.length - 1 ){
                let nextAttr = attributeOrder[index + 1];
                let nextDropdown = document.getElementById('dropdown-' + nextAttr);
                Array.from(nextDropdown.options).forEach(o => {
                    var testValue = isNaN(+o.value.split('--')[1]) ? o.value.split('--')[1] : +o.value.split('--')[1];
                    if ( model.matching[nextAttr].indexOf(testValue) === -1 ) {
                        o.setAttribute('disabled','');
                    }
                });
                nextDropdown.removeAttribute('disabled');
            }
            console.log(model.matching);
            if ( model.matching.fisheries.length === 1 ) {
                S.setState('selection', ['id', model.matching.fisheries[0].id]);
            }
        },
        selectFishery(msg,data){
            console.log('selection made!', msg, data);
            if ( data === null ){
                controller.resetSelections();
                return;
            }
            model.matching.fisheries = model.fisheries.filter(f => f.id === data[1]);
            attributeOrder.forEach(attr => {
                document.getElementById('dropdown-' + attr).removeAttribute('disabled');    
            });
            [...attributeOrder, 'id'].forEach(attr => {
                document.getElementById('dropdown-' + attr).value = attr + '--' + model.matching.fisheries[0][attr];
            });
            attributeOrder.forEach(attr => {
                document.getElementById('dropdown-' + attr).setAttribute('disabled','');
            });
        },
        resetSelections(){
            document.querySelectorAll('#selectors select').forEach((select, i, array) => {
                if ( i === 0 || i === array.length - 1 ){
                    select.removeAttribute('disabled');
                } else {
                    select.setAttribute('disabled','');
                }
                select.value = '';
                Array.from(select.options).forEach(o => {
                    o.removeAttribute('disabled');
                });
            });
            model.matching.fisheries = model.fisheries;
        },
        mapViewOnRender(div){

            var wrapper = div.querySelector('.map-wrapper');
            div.querySelectorAll('circle').forEach(c => {
                c.addEventListener('mouseenter', activate);
                c.addEventListener('mouseleave', deactivate);
                c.addEventListener('focus', activate);
                c.addEventListener('blur', deactivate);
                c.addEventListener('click', function(e){
                    e.stopPropagation();
                    clickEnterHandler.call(this);
                });
                c.addEventListener('keyup', function(e){
                    e.stopPropagation();
                    if (e.keyCode === 13) {
                        clickEnterHandler.call(this);
                    }
                });
            });
            function clickEnterHandler(){
                var currentSelection = S.getState('selection');
                var name = this.getAttribute('data-name');
                if ( currentSelection && currentSelection[1] === name){ // is same node
                    S.setState('selection', null);
                    wrapper.removeEventListener('click', mapClickHandler); // div = .map-container
                } else {
                    S.setState('selection', ['id',name]);
                    wrapper.addEventListener('click', mapClickHandler);

                }
            }
            function mapClickHandler(){
                S.setState('selection', null);
                wrapper.removeEventListener('click', mapClickHandler);
            }
            function activate(e){
                var name = this.getAttribute('data-name');
                e.stopPropagation();
                clearTimeout(timeout);
                    S.setState('preview',['id', name]);
            }
            var timeout;
            function deactivate(e){
                e.stopPropagation();
                timeout = setTimeout(() => {
                    var selection = S.getState('selection');
                    if (!selection) { // only allow mouseover  preview / depreview if nothing is selected
                        S.setState('preview', null);
                    } else {
                        S.setState('preview', selection)   
                    }
                }, 200);
            }
        },
        highlightConnected(msg,data){
            var svg = document.querySelector('.map-container svg');
            if ( svg.querySelector('circle.connected') ){
                svg.querySelector('circle.connected').classList.remove('connected');   
            }
            if ( data !== null && data !== 'null' ){
                svg.querySelector('circle[data-name=' + data + ']').classList.add('connected');
            }
        },
        highlightNodes(msg,data){
            console.log(msg,data);
            
            var svg = document.querySelector('.map-container svg');
            var bars = document.querySelector('.sidebarDiv.fisheries');
            if (msg === 'selection' ){
                bars.classList.remove('preview');
                svg.querySelectorAll('.nodes circle').forEach(function(each){
                    each.classList.add('not-active');
                    each.classList.remove('active');
                    each.classList.remove('attached');
                    each.classList.remove('preview');
                });
                unhighlightLinkedNodes();
                if ( data !==  null ){
                    svg.classList.add('activated')
                }
            }
            var preview = svg.querySelector('.nodes circle.preview');
            if (preview) {
                preview.classList.remove('preview');
            }
            if ( data !== null ){
                let active = svg.querySelector(`.nodes circle[data-name=${data[1]}]`);
                active.classList.remove('not-active');
                active.classList.add(`${msg === 'selection' ? 'active' : !active.classList.contains('active') ? 'preview' : null}`);
                if (msg ==='selection'){
                    highlightLinkedNodes(active.getAttribute('data-name'));
                } else if (!active.classList.contains('active')) {
                    bars.classList.add('preview');
                } else {
                    bars.classList.remove('preview');
                }
            } else {
                bars.classList.remove('preview');
                svg.classList.remove('activated')
                
            }
            function highlightLinkedNodes(name){
                
                svg.querySelectorAll('line.' + name).forEach(l => {
                    l.classList.add('active');
                    var attachedNodes = l.className.baseVal.match(/[A-Z]+-.*?-[^ ]+/g); // returns array of the two ids part of the line's classname
                    console.log(attachedNodes);
                    attachedNodes.forEach(ndId => {
                        if ( ndId !== name ){
                            let nd = svg.querySelector('circle[data-name="' + ndId + '"]');
                            if ( nd ) {
                                nd.classList.remove('not-active');
                                nd.classList.add('attached');
                            }
                        }
                    });
                });
                checkClusterLabels();
                checkStatewideRects();
            }
            function checkClusterLabels(){
                var activeNodes = svg.querySelectorAll('circle.active, circle.attached');
                console.log(activeNodes);
                var activeClusters = [];
                activeNodes.forEach(nd => {
                    var index = activeClusters.indexOf(nd.getAttribute('data-cluster'));
                    if ( index === -1 ){
                        activeClusters.push(nd.getAttribute('data-cluster'));
                    }
                });
                console.log(activeClusters);
                [1,2,3,4,5].forEach(c => {
                    if (activeClusters.indexOf(c.toString()) === -1 ){
                        svg.querySelector('.cluster-label-' + c).classList.add('hide');
                    } else {
                        svg.querySelector('.cluster-label-' + c).classList.remove('hide');
                    }
                });

            }
            function checkStatewideRects(){
                 var activeStatewide = svg.querySelectorAll('circle[data-area="Statewide"].active, circle[data-area="Statewide"].attached');
                 var activeStatewideClusters = [];
                 activeStatewide.forEach(nd => {
                    if ( activeStatewideClusters.indexOf(nd.getAttribute('data-cluster')) === -1 ){
                        activeStatewideClusters.push(nd.getAttribute('data-cluster'));
                    }
                 });
                 [1,2,3,4,5,6].forEach(c => {
                    if (activeStatewideClusters.indexOf(c.toString()) === -1 ){
                        svg.querySelector('rect.statewide-rect-cluster-' + c).classList.add('hide');
                    } else {
                        svg.querySelector('rect.statewide-rect-cluster-' + c).classList.remove('hide');
                    }
                 });
            }
            function unhighlightLinkedNodes(){
                svg.querySelectorAll('line.active').forEach(l => {
                    l.classList.remove('active');
                });
                svg.querySelectorAll('circle.attached').forEach(c => {
                    c.classList.remove('attached');
                });
                svg.querySelectorAll('.nodes text').forEach(c => {
                    c.classList.remove('hide');
                });
                svg.querySelectorAll('rect.statewide-rect').forEach(rect => {
                    rect.classList.remove('hide');
                });
            }
        },
        fadeOutText(el){
            el.classList.add('no-opacity');
        },
        fadeInText(el,text){
            return new Promise((resolve) => {
                var durationStr = window.getComputedStyle(el).getPropertyValue('transition-duration');
                var duration = parseFloat(durationStr) * 1000;
                console.log(duration);
                controller.fadeOutText(el);
                setTimeout(() => {
                    el.innerHTML = text;
                    el.classList.remove('no-opacity');
                    resolve(true);
                }, duration);
            });

        },
        updateFisheryDetails(msg,data){ // TO DO: GIVE SCOPE TO THE S DOT STYLE DEFINITIONS
            var sb = sidebars[0];
            var div = document.querySelector(`#${sb.id}-details`);
            var index = 0;
            if ( data !== null ){
                //var matchFn = sb.id === 'fisheries' ? x => x.id === data[1] : sb.id === 'clusters' ? x => x.id === model.fisheries.find(f => f.id === data[1]).cluster : () => true;
                let matchFn = x => x.id === data[1];
                if ( msg === 'selection' ) {
                    div.classList.remove(sidebarStyles.notApplicable);
                }
                let titleText = data[1].split('-').reduce((acc, cur, i) => {
                    return i === 0 ? model.dict[attributeOrder[i]][cur] : acc + ' — ' + model.dict[attributeOrder[i]][cur];
                },'');
                controller.fadeInText(div.querySelector('h4'), titleText);
                controller.fadeInText(div.parentNode.querySelector('h3'), data[1]);
                sb.fields.forEach(field => {
                    index++;
                    var valueSpan = div.querySelector(`.field-${field} .field-value`);
                    var value = !isNaN(sb.data.find(matchFn)[field]) ? d3.format(',')(sb.data.find(matchFn)[field]) : 'n.a.';
                    setTimeout(() => {
                        controller.fadeInText(valueSpan, value);
                    },index * 25 + 6);
                });
            } else {
                div.classList.add(sidebarStyles.notApplicable);
                div.querySelectorAll('span.field-value').forEach(span => {
                    controller.fadeInText(span, 'n.a.');
                });
                controller.fadeInText(div.querySelector('h4'), '');
                controller.fadeOutText(div.parentNode.querySelector('h3'));
                    
            }
            if ( msg === 'selection') {
                controller.updateAllCharts(data);
            } else {
                controller.updateFishChart(data);
            }
        },
        updateClusterDetails(msg,data){ // TO DO: GIVE SCOPE TO THE S DOT STYLE DEFINITIONS
            var sb = sidebars[1];
            var div = document.querySelector(`#${sb.id}-details`);
            var index = 0;
            if ( data !== null ){
               div.classList.remove(sidebarStyles.notApplicable);
               let titleText = 'Cluster ' + data;
               let heading = div.parentNode.querySelector('h3');
               heading.className = 'cluster-' + data;
               controller.fadeInText(div.parentNode.querySelector('h3'), titleText);
               sb.fields.forEach(field => {
                    index++;
                    var valueSpan = div.querySelector(`.field-${field} .field-value`);
                    var value = !isNaN(sb.data.find(f => f.id === data)[field]) ? d3.format(',')(sb.data.find(f => f.id === data)[field]) : 'n.a.';
                    // specify matching criteria for the different sidebars; node sidebar: id matches id; cluster: id matches cluster of fishery matching id: network: doesn't change fn retur true always
                    setTimeout(() => {
                        controller.fadeInText(valueSpan, value);
                    },index * 25 + 6);
                });
            } else {
                div.classList.add(sidebarStyles.notApplicable);
                div.querySelectorAll('span.field-value').forEach(span => {
                    controller.fadeInText(span, 'n.a.');
                });
                controller.fadeOutText(div.parentNode.querySelector('h3'));
            }
            
        },
        updateAllCharts(data){
            sidebars.forEach(sidebar => {
                if ( sidebar.charts ){
                    sidebar.charts.forEach(chart => {
                        var param = data !== null ? ( chart.sidebarID === 'fisheries' ? data[1] : model.fisheries.find(f => f.id === data[1]).cluster ) : 'reset'; // for fishery charts pass in fishery id; for cluster charts pass in cluster if matching fishery
                        chart.update(param);
                    });
                }
            });
        },
        updateFishChart(data){
            var sidebar = sidebars.find(sb => sb.id === 'fisheries');
            sidebar.charts.forEach(chart => {
                var param = data !== null ? ( chart.sidebarID === 'fisheries' ? data[1] : model.fisheries.find(f => f.id === data[1]).cluster ) : 'reset'; // for fishery charts pass in fishery id; for cluster charts pass in cluster if matching fishery
                chart.update(param);
            });
        },
        setNetworkDetails(){
            var div = document.querySelector('#network-details');
            div.classList.remove(sidebarStyles.notApplicable);
            sidebars.find(sb => sb.id === 'network').fields.forEach((field,i) => {
                var valueSpan = div.querySelector(`.field-${field} .field-value`);
                console.log(network);
                setTimeout(() => {
                    controller.fadeInText(valueSpan, d3.format(',')(network[0][field]));
                },i * 25);
            });
        },
        highlightListItems(msg,data){
            document.querySelectorAll('.listView li').forEach(item => {
                item.classList.remove('selected-list-item');
            });
            if ( data !== null ){
                document.querySelectorAll('li[data-id="' + data[1] + '"]').forEach(item => {
                    item.classList.add('selected-list-item');
                });
            }
        }
    };
 
    var model = {
        fisheries,
        dict: {
            species,
            gear,
            area,
            fields,
            descriptions
        },
        matching: {
            fisheries
        } 
    };

    var views = {

    };

    return {
        controller
    }   

})(); // end IIFE

export default fullAPI;