hexo.extend.generator.register('archive', function(locals){
    return {
      path: 'archives/index.html',
      data: locals.posts,
      layout: ['years']
    }
  });